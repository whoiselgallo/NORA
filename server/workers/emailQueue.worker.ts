import { Worker, Job } from 'bullmq';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { EmailJobData, CampaignDispatcherService } from '../services/campaignDispatcher.service';

export function createEmailMarketingWorker(
  pool: Pool,
  io: SocketIOServer,
  dispatcher: CampaignDispatcherService,
  redisUrl?: string
) {
  return new Worker<EmailJobData>(
    'email-marketing-queue',
    async (job: Job<EmailJobData>) => {
      const { campaignId, logId } = job.data;

      try {
        // Mock de entrega hacia proveedor (Amazon SES / Resend) con RFC 8058
        const mockMessageId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        await new Promise((resolve, reject) => {
          setTimeout(() => {
            if (Math.random() < 0.02) {
              reject(new Error('PROVIDER_RATE_LIMIT: HTTP 429 Too Many Requests'));
            } else {
              resolve(true);
            }
          }, 60);
        });

        // Registrar entrega
        await pool.query(
          `UPDATE marketing_email_logs
           SET status = 'DELIVERED', message_id = $1, sent_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [mockMessageId, logId]
        );

        // Incrementar métricas en campaña
        const campRes = await pool.query(
          `UPDATE marketing_campaigns
           SET sent_count = sent_count + 1, delivered_count = delivered_count + 1
           WHERE id = $1
           RETURNING project_id, total_recipients, delivered_count, sent_count`,
          [campaignId]
        );

        const camp = campRes.rows[0];

        // Emitir telemetría por WebSocket
        io.to(`project:${camp.project_id}`).emit('CAMPAIGN_TELEMETRY_PULSE', {
          campaignId,
          totalRecipients: camp.total_recipients,
          deliveredCount: camp.delivered_count,
          sentCount: camp.sent_count
        });

        // Si se completó el lote, evaluar la regla de color de marketing >= 95%
        if (camp.sent_count >= camp.total_recipients) {
          await pool.query(
            `UPDATE marketing_campaigns
             SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [campaignId]
          );
          await dispatcher.checkCampaignCompletionRule(campaignId);
        }

        return { messageId: mockMessageId, status: 'DELIVERED' };
      } catch (err: any) {
        await pool.query(
          `UPDATE marketing_email_logs
           SET status = 'PENDING', error_message = $1
           WHERE id = $2`,
          [err.message, logId]
        );
        throw err;
      }
    },
    {
      connection: {
        url: redisUrl || process.env.REDIS_URL || 'redis://127.0.0.1:6379'
      },
      limiter: {
        max: 50,
        duration: 1000
      },
      concurrency: 5
    }
  );
}
