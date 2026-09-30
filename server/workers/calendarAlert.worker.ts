import { Queue, Worker, Job } from 'bullmq';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { CalendarService } from '../services/calendar.service';

export interface CalendarAlertJobData {
  triggeredAt: string;
}

export function createCalendarAlertScheduler(
  pool: Pool,
  io: SocketIOServer,
  redisUrl?: string,
  webhookMasterBaseUrl: string = 'http://localhost:4000'
) {
  const connectionUrl = redisUrl || process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const calendarService = new CalendarService(pool);

  // Cola para el programador de alertas del calendario
  const queue = new Queue<CalendarAlertJobData>('calendar-alert-scheduler', {
    connection: { url: connectionUrl }
  });

  // Configurar trabajo repetible / cron cada minuto (y disparo inmediato)
  queue.add(
    'check-calendar-alerts',
    { triggeredAt: new Date().toISOString() },
    {
      repeat: {
        every: 60000 // Cada 60 segundos
      } as any,
      removeOnComplete: true
    } as any
  ).catch(err => {
    console.warn('Note: Could not register calendar alert repeatable job:', err.message);
  });

  // Worker que procesa la búsqueda de hitos próximos o vencidos
  const worker = new Worker<CalendarAlertJobData>(
    'calendar-alert-scheduler',
    async (job: Job<CalendarAlertJobData>) => {
      try {
        const pendingEvents = await calendarService.getPendingAlertEvents();

        for (const event of pendingEvents) {
          const now = new Date();
          const dueDate = new Date(event.due_date);
          const isOverdue = dueDate < now;

          const alertPayload = {
            event: 'CALENDAR_EVENT_ALERT',
            eventId: event.id,
            title: event.title,
            dueDate: event.due_date,
            priority: event.priority,
            workspaceId: event.workspace_id,
            projectId: event.project_id,
            isOverdue
          };

          // Despachar al Webhook Master vía HTTP interno
          try {
            const masterUrl = `${webhookMasterBaseUrl}/api/v1/webhooks/master/calendar-alerts`;
            const response = await fetch(masterUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(alertPayload)
            });

            if (response.ok) {
              await calendarService.markAlertTriggered(event.id);
            }
          } catch {
            // Si el servidor HTTP local está en arranque, emitir directamente por WebSocket y marcar
            await calendarService.markAlertTriggered(event.id);
            io.to(`workspace_${event.workspace_id}`).emit('CALENDAR_ALERT', alertPayload);
            if (event.project_id) {
              io.to(`project:${event.project_id}`).emit('CALENDAR_ALERT', alertPayload);
            }
          }
        }

        return { processedCount: pendingEvents.length };
      } catch (err: any) {
        console.error('Error processing calendar alerts:', err);
        throw err;
      }
    },
    {
      connection: { url: connectionUrl },
      concurrency: 2
    }
  );

  return { queue, worker };
}
