import { Pool } from 'pg';
import { Queue } from 'bullmq';
import { Server as SocketIOServer } from 'socket.io';
import { DagCacheService } from './dagCache.service';

export interface EmailBatchRecipient {
  contactId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

export interface EmailBatchJobData {
  campaignId: string;
  projectId: string;
  batchIndex: number;
  totalBatches: number;
  recipients: EmailBatchRecipient[];
  subject: string;
  htmlBodyTemplate: string;
  plainTextBodyTemplate?: string | null;
  baseUrl: string;
}

export class CampaignDispatcherService {
  private batchQueue: Queue<EmailBatchJobData>;
  private dagCacheService: DagCacheService;

  constructor(
    private pool: Pool,
    private io: SocketIOServer,
    redisUrl?: string,
    dagCacheService?: DagCacheService
  ) {
    const connectionUrl = redisUrl || process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    this.dagCacheService = dagCacheService || new DagCacheService(connectionUrl);

    // Cola BullMQ optimizada para despacho por lotes con desconexión resiliente
    this.batchQueue = new Queue<EmailBatchJobData>('email-marketing-batch-queue', {
      connection: {
        url: connectionUrl,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        enableOfflineQueue: false
      },
      defaultJobOptions: {
        attempts: 3, // 3 reintentos obligatorios
        backoff: {
          type: 'exponential',
          delay: 5000 // Retroceso exponencial de 5 segundos
        },
        removeOnComplete: true,
        removeOnFail: false
      }
    });
    this.batchQueue.on('error', (err) => {
      console.warn('BullMQ email-marketing-batch-queue connection warning:', err.message);
    });
  }

  public getQueue(): Queue<EmailBatchJobData> {
    return this.batchQueue;
  }

  /**
   * Despacho por lotes de mercadotecnia masiva (50 destinatarios por lote)
   */
  public async dispatchCampaign(
    campaignId: string,
    baseUrl: string
  ): Promise<{ totalRecipients: number; totalBatches: number; queuedJobs: number }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Obtener campaña y plantilla asociada
      const campRes = await client.query(
        `SELECT c.*, t.subject, t.html_body, t.plain_text_body
         FROM marketing_campaigns c
         JOIN marketing_templates t ON c.template_id = t.id
         WHERE c.id = $1 FOR UPDATE`,
        [campaignId]
      );

      if (campRes.rows.length === 0) {
        throw new Error(`Campaign with ID '${campaignId}' not found.`);
      }
      const campaign = campRes.rows[0];

      // 2. Consultar contactos activos excluyendo marketing_suppression_list y no suscritos
      const contactsRes = await client.query(
        `SELECT mc.id, mc.email, mc.first_name, mc.last_name, mc.custom_metadata
         FROM marketing_contacts mc
         WHERE mc.audience_id = $1
           AND mc.is_subscribed = true
           AND mc.bounced = false
           AND mc.email NOT IN (SELECT email FROM marketing_suppression_list)
         ORDER BY mc.created_at ASC`,
        [campaign.audience_id]
      );

      const contacts = contactsRes.rows;
      if (contacts.length === 0) {
        throw new Error('No eligible contacts found for this audience (all suppressed or unsubscribed).');
      }

      // 3. Dividir la lista en bloques o particiones fijas de 50 destinatarios
      const BATCH_SIZE = 50;
      const batches: EmailBatchRecipient[][] = [];

      for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
        const chunk = contacts.slice(i, i + BATCH_SIZE).map(c => ({
          contactId: c.id,
          email: c.email,
          firstName: c.first_name,
          lastName: c.last_name
        }));
        batches.push(chunk);
      }

      // Actualizar estado general de la campaña
      await client.query(
        `UPDATE marketing_campaigns
         SET status = 'PROCESSING',
             total_recipients = $1,
             started_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [contacts.length, campaignId]
      );

      await client.query('COMMIT');

      // 4. Encolar cada bloque como un único trabajo en email-marketing-batch-queue
      let queuedJobs = 0;
      for (let idx = 0; idx < batches.length; idx++) {
        await this.batchQueue.add(
          'process-email-batch',
          {
            campaignId,
            projectId: campaign.project_id,
            batchIndex: idx + 1,
            totalBatches: batches.length,
            recipients: batches[idx],
            subject: campaign.subject,
            htmlBodyTemplate: campaign.html_body,
            plainTextBodyTemplate: campaign.plain_text_body,
            baseUrl
          }
        );
        queuedJobs++;
      }

      // Emisión inicial de telemetría a la sala del proyecto
      this.io.to(`project:${campaign.project_id}`).emit('CAMPAIGN_TELEMETRY_PULSE', {
        campaignId,
        status: 'PROCESSING',
        totalRecipients: contacts.length,
        totalBatches: batches.length,
        sentCount: 0,
        deliveredCount: 0
      });

      return {
        totalRecipients: contacts.length,
        totalBatches: batches.length,
        queuedJobs
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Comprobar regla del 95% de tasa de entrega para mutar el nodo de marketing del DAG a GREEN.
   * Realiza la invalidación atómica de Redis inmediatamente ANTES de notificar por WebSocket.
   */
  public async checkCampaignCompletionRule(campaignId: string): Promise<boolean> {
    const res = await this.pool.query(
      `SELECT project_id, total_recipients, delivered_count, status
       FROM marketing_campaigns WHERE id = $1`,
      [campaignId]
    );
    if (res.rows.length === 0) return false;

    const { project_id, total_recipients, delivered_count } = res.rows[0];
    if (total_recipients > 0) {
      const deliveryRate = (delivered_count / total_recipients) * 100;

      if (deliveryRate >= 95.0) {
        // Mutar nodos de categoría marketing a GREEN
        const nodeUpdate = await this.pool.query(
          `UPDATE workflow_nodes
           SET status = 'GREEN',
               completed_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE workflow_id IN (SELECT id FROM project_workflows WHERE project_id = $1)
             AND category = 'marketing'
             AND status != 'GREEN'
           RETURNING id, slug, title`,
          [project_id]
        );

        if (nodeUpdate.rows.length > 0) {
          // 1. Invalidación atómica de la caché DAG en Redis
          await this.dagCacheService.invalidateDag(project_id);

          // 2. Emisión WebSocket inmediata para refrescar pizarrón
          for (const n of nodeUpdate.rows) {
            this.io.to(`project:${project_id}`).emit('WORKFLOW_NODE_TRANSITION', {
              nodeId: n.id,
              slug: n.slug,
              title: n.title,
              status: 'GREEN',
              reason: 'MARKETING_CAMPAIGN_DELIVERY_SUCCESS_THRESHOLD'
            });
          }
          return true;
        }
      }
    }
    return false;
  }
}
