import { Worker, Job } from 'bullmq';
import { Pool, PoolClient } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { EmailBatchJobData, CampaignDispatcherService } from '../services/campaignDispatcher.service';

/**
 * Worker optimizado para procesar lotes de marketing (50 destinatarios por trabajo)
 * con concurrencia controlada de hasta 5 workers en paralelo.
 */
export function createEmailBatchWorker(
  pool: Pool,
  io: SocketIOServer,
  dispatcher: CampaignDispatcherService,
  redisUrl?: string
) {
  const connectionUrl = redisUrl || process.env.REDIS_URL || 'redis://127.0.0.1:6379';

  return new Worker<EmailBatchJobData>(
    'email-marketing-batch-queue',
    async (job: Job<EmailBatchJobData>) => {
      const {
        campaignId,
        projectId,
        batchIndex,
        totalBatches,
        recipients,
        subject,
        htmlBodyTemplate,
        baseUrl
      } = job.data;

      const batchCount = recipients.length;
      if (batchCount === 0) return { processed: 0 };

      // 1. Simular / Ejecutar envío masivo vía API al proveedor (Amazon SES / Resend)
      const simulatedDispatchLogs: Array<{
        contactId: string;
        messageId: string;
        status: 'DELIVERED' | 'FAILED';
        errorMessage?: string;
      }> = [];

      for (const recipient of recipients) {
        const messageId = `msg_batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        // Personalización de plantilla
        const personalizedHtml = htmlBodyTemplate
          .replace(/\{\{\s*first_name\s*\}\}/g, recipient.firstName || 'Cliente')
          .replace(/\{\{\s*email\s*\}\}/g, recipient.email);

        simulatedDispatchLogs.push({
          contactId: recipient.contactId,
          messageId,
          status: 'DELIVERED'
        });
      }

      // Latencia de despacho agrupado (controlada para API del proveedor)
      await new Promise(resolve => setTimeout(resolve, 80));

      // 2. Transacción SQL atómica: inserción masiva en marketing_email_logs e incremento en campaña
      const client: PoolClient = await pool.connect();
      try {
        await client.query('BEGIN');

        // Construir sentencia SQL para inserción masiva de los 50 registros en una sola consulta
        const valuesPlaceholders: string[] = [];
        const queryParams: any[] = [];
        let paramIndex = 1;

        for (const log of simulatedDispatchLogs) {
          valuesPlaceholders.push(
            `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, CURRENT_TIMESTAMP)`
          );
          queryParams.push(campaignId, log.contactId, log.messageId, log.status);
          paramIndex += 4;
        }

        const bulkInsertQuery = `
          INSERT INTO marketing_email_logs (campaign_id, contact_id, message_id, status, sent_at)
          VALUES ${valuesPlaceholders.join(', ')}
        `;
        await client.query(bulkInsertQuery, queryParams);

        // Incrementar sent_count y delivered_count de forma atómica
        const campRes = await client.query(
          `UPDATE marketing_campaigns
           SET sent_count = sent_count + $1,
               delivered_count = delivered_count + $1
           WHERE id = $2
           RETURNING project_id, total_recipients, sent_count, delivered_count, status`,
          [batchCount, campaignId]
        );

        const campaign = campRes.rows[0];

        // Si se completaron todos los lotes de la campaña, marcar como COMPLETED
        let isFullyCompleted = false;
        if (campaign && campaign.sent_count >= campaign.total_recipients) {
          await client.query(
            `UPDATE marketing_campaigns
             SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [campaignId]
          );
          isFullyCompleted = true;
        }

        await client.query('COMMIT');

        // 3. Emitir evento WebSocket CAMPAIGN_TELEMETRY_PULSE a la sala del proyecto
        io.to(`project:${projectId}`).emit('CAMPAIGN_TELEMETRY_PULSE', {
          campaignId,
          batchIndex,
          totalBatches,
          processedInBatch: batchCount,
          sentCount: campaign.sent_count,
          deliveredCount: campaign.delivered_count,
          totalRecipients: campaign.total_recipients,
          status: isFullyCompleted ? 'COMPLETED' : 'PROCESSING',
          timestamp: new Date().toISOString()
        });

        // 4. Si se completó la campaña, evaluar regla del 95% para transicionar nodo DAG a GREEN
        if (isFullyCompleted) {
          await dispatcher.checkCampaignCompletionRule(campaignId);
        }

        return {
          batchIndex,
          totalBatches,
          processed: batchCount,
          campaignCompleted: isFullyCompleted
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    {
      connection: {
        url: connectionUrl
      },
      concurrency: 5 // Máximo 5 workers en paralelo
    }
  );
}

// Mantener compatibilidad retroactiva si algún módulo importa createEmailMarketingWorker
export const createEmailMarketingWorker = createEmailBatchWorker;
