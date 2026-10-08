import express, { Request, Response } from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { Pool } from 'pg';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import { createApiRouter } from './routes/api.routes';
import { CampaignDispatcherService } from './services/campaignDispatcher.service';
import { DagCacheService } from './services/dagCache.service';
import { createEmailBatchWorker } from './workers/emailQueue.worker';
import { createCalendarAlertScheduler } from './workers/calendarAlert.worker';
import { createNexusKnowledgeWorker } from './workers/nexusKnowledge.worker';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT']
  }
});

const DEFAULT_NEON_DATABASE_URL =
  'postgresql://neondb_owner:npg_OMSJrQ3mf1WY@ep-quiet-forest-b503dzg6-pooler.c-7.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require';
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || DEFAULT_NEON_DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

// Inicializar capa de caché Redis del DAG con soporte multi-workspace
const dagCache = new DagCacheService();

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
app.use(express.static(path.join(__dirname, '../public')));

// Enrutador de API v1 con inyección de Pool, SocketIO y DagCacheService
const apiRouter = createApiRouter(pool, io, dagCache);
app.use('/api/v1', apiRouter);
app.use('/v1', apiRouter);
app.use('/api', apiRouter);

// Middleware global de captura de errores para garantizar respuestas JSON
app.use((err: any, _req: Request, res: Response, _next: any) => {
  console.error('[API Unhandled Error]:', err);
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

const PORT = process.env.PORT || 4000;
if (!process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

export { app, server, pool, io, dagCache };
export default app;
