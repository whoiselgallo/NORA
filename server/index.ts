import express, { Request, Response } from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
import { createApiRouter } from './routes/api.routes';
import { CampaignDispatcherService } from './services/campaignDispatcher.service';
import { DagCacheService } from './services/dagCache.service';
import { createEmailBatchWorker } from './workers/emailQueue.worker';
import { createCalendarAlertScheduler } from './workers/calendarAlert.worker';
import { createNexusKnowledgeWorker } from './workers/nexusKnowledge.worker';
import { createStructuredLogger, getSloMetricsSnapshot } from './middleware/structuredLogger.middleware';
import { DiscordAlertsService } from './services/discordAlerts.service';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT']
  }
});

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL o DATABASE_URL_UNPOOLED debe estar configurado en el entorno (.env.local)');
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

// Inicializar capa de caché Redis del DAG con soporte multi-workspace
const dagCache = new DagCacheService();

// Middleware de Logs Estructurados para Google Cloud Logging y Cloud Trace (Meta 5)
app.use(createStructuredLogger());

// Health check para Google Cloud Run, Kubernetes y Uptime Checks (Meta 5)
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'tsolutions-nexus-platform',
    version: '1.0.0'
  });
});

// Endpoint de métricas de confiabilidad SLI / SLO en tiempo real (Meta 5)
app.get('/api/v1/metrics/slo', (_req: Request, res: Response) => {
  res.status(200).json({
    slo_target: '99.9%',
    metrics: getSloMetricsSnapshot()
  });
});

// Middleware rawBody para validación HMAC de webhooks de GitHub
app.use(cors());
app.use(
  express.json({
    verify: (req: Request, _res: Response, buf: Buffer) => {
      (req as any).rawBody = buf;
    }
  })
);

// Servir archivos estáticos del directorio public (activos, logos, SVG)
const publicDir = fs.existsSync(path.join(process.cwd(), 'public'))
  ? path.join(process.cwd(), 'public')
  : path.join(__dirname, '../public');
app.use(express.static(publicDir, { extensions: ['html', 'htm'] }));

// Ruta raíz explícita para garantizar servicio inmediato del index.html
app.get('/', (_req: Request, res: Response) => {
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send('<h1>NORA // Nexus Orquestador</h1>');
  }
});

// Rutas dedicadas de alta disponibilidad para herramientas y modelos del footer
app.get(['/prompt_architect', '/prompt_architect.html'], (_req: Request, res: Response) => {
  const f = path.join(publicDir, 'prompt_architect.html');
  if (fs.existsSync(f)) return res.sendFile(f);
  res.redirect('/');
});

app.get(['/generador_lockups_tecnicos', '/generador_lockups_tecnicos.html'], (_req: Request, res: Response) => {
  const f = path.join(publicDir, 'generador_lockups_tecnicos.html');
  if (fs.existsSync(f)) return res.sendFile(f);
  res.redirect('/');
});

app.get(['/MPS_AYALA_PROPUESTA_ROI_001', '/MPS_AYALA_PROPUESTA_ROI_001.html', '/modelo_financiero_roi', '/roi'], (_req: Request, res: Response) => {
  const f = path.join(publicDir, 'MPS_AYALA_PROPUESTA_ROI_001.html');
  if (fs.existsSync(f)) return res.sendFile(f);
  res.redirect('/');
});

app.get(['/propuesta_servicios_digitales_mps', '/propuesta_servicios_digitales_mps.html', '/soluciones_digitales_mps', '/PROPUESTA%20DE%20SERVICIOS%20Y%20SOLUCIONES%20DIGITALES%20MPS%20AYALA.', '/PROPUESTA%20DE%20SERVICIOS%20Y%20SOLUCIONES%20DIGITALES%20MPS%20AYALA..html'], (_req: Request, res: Response) => {
  const p1 = path.join(publicDir, 'propuesta_servicios_digitales_mps.html');
  const p2 = path.join(publicDir, 'PROPUESTA DE SERVICIOS Y SOLUCIONES DIGITALES MPS AYALA..html');
  if (fs.existsSync(p1)) return res.sendFile(p1);
  if (fs.existsSync(p2)) return res.sendFile(p2);
  res.redirect('/');
});

// Enrutador de API v1 con inyección de Pool, SocketIO y DagCacheService
const apiRouter = createApiRouter(pool, io, dagCache);
app.use('/api/v1', apiRouter);
app.use('/v1', apiRouter);
app.use('/api', apiRouter);

// Middleware global de captura de errores para garantizar respuestas JSON
app.use((err: any, req: Request, res: Response, _next: any) => {
  console.error('[API Unhandled Error]:', err);
  
  // Despacho no bloqueante de alertas SRE a Discord / Slack ($0/mes)
  DiscordAlertsService.getInstance()
    .sendErrorAlert(err, {
      route: req.originalUrl || req.path,
      method: req.method,
      ip: req.ip
    })
    .catch(() => {});

  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    code: err.code || 'SERVER_ERROR'
  });
});

// Gestión de conexiones y salas WebSocket por Workspace y Proyecto
io.on('connection', socket => {
  // Salas de workspace aisladas (workspace_WORKSPACE_ID)
  socket.on('JOIN_WORKSPACE', (workspaceId: string) => {
    socket.join(`workspace_${workspaceId}`);
  });

  socket.on('LEAVE_WORKSPACE', (workspaceId: string) => {
    socket.leave(`workspace_${workspaceId}`);
  });

  // Salas de proyecto
  socket.on('JOIN_PROJECT', (projectId: string) => {
    socket.join(`project:${projectId}`);
  });

  socket.on('LEAVE_PROJECT', (projectId: string) => {
    socket.leave(`project:${projectId}`);
  });
});

// Iniciar workers de BullMQ ÚNICAMENTE fuera de entornos serverless (evitar caídas en Vercel)
if (!process.env.VERCEL) {
  // Iniciar worker de email marketing por lotes (BullMQ Batching)
  try {
    const dispatcher = new CampaignDispatcherService(pool, io, undefined, dagCache);
    createEmailBatchWorker(pool, io, dispatcher);
    console.log('✓ BullMQ Email Marketing Batch Worker initialized (concurrency: 5).');
  } catch (err: any) {
    console.warn('Note: Redis connection for BullMQ Worker skipped or deferred:', err.message);
  }

  // Iniciar programador de alertas del Calendario Maestro (BullMQ)
  try {
    createCalendarAlertScheduler(pool, io);
    console.log('✓ BullMQ Calendar Alert Scheduler initialized.');
  } catch (err: any) {
    console.warn('Note: Redis connection for Calendar Alert Scheduler skipped:', err.message);
  }

  // Iniciar worker de asimilación de conocimiento en el cerebro Nexus (BullMQ + pgvector)
  try {
    createNexusKnowledgeWorker(pool, io);
    console.log('✓ BullMQ Nexus Knowledge Assimilation Worker initialized (concurrency: 3).');
  } catch (err: any) {
    console.warn('Note: Redis connection for Nexus Knowledge Worker skipped:', err.message);
  }
}

// Puerto de escucha dinámico: si Vercel inyecta PORT o estamos en runtime, escuchar siempre
const PORT = process.env.PORT || 4000;
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

export { app, server, pool, io, dagCache, DiscordAlertsService };
export default app;
