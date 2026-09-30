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
  console.error('Missing DATABASE_URL / DATABASE_URL_UNPOOLED in .env.local');
  process.exit(1);
}

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

// Enrutador de API v1 con inyección de Pool, SocketIO y DagCacheService
app.use('/api/v1', createApiRouter(pool, io, dagCache));

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

const PORT = process.env.PORT || 4000;
if (!process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

export { app, server, pool, io, dagCache };
export default app;
