import { Pool } from 'pg';
import { Queue } from 'bullmq';
import { Server as SocketIOServer } from 'socket.io';

export interface EmailJobData {
  campaignId: string;
  contactId: string;
  logId: string;
  recipientEmail: string;
  subject: string;
  htmlBody: string;
  plainTextBody?: string;
  unsubscribeUrl: string;
}

export class CampaignDispatcherService {
  private emailQueue: Queue<EmailJobData>;

  constructor(private pool: Pool, private io: SocketIOServer, redisUrl?: string) {
    this.emailQueue = new Queue<EmailJobData>('email-marketing-queue', {
      connection: {
        url: redisUrl || process.env.REDIS_URL || 'redis://127.0.0.1:6379'
      },
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: true
      }
    });
  }

  public async dispatchCampaign(campaignId: string, baseUrl: string): Promise<{ queuedCount: number }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Obtener campaña, plantilla y audiencia
      const campRes = await client.query(
        `SELECT c.*, t.subject, t.html_body, t.plain_text_body
         FROM marketing_campaigns c
         JOIN marketing_templates t ON c.template_id = t.id
         WHERE c.id = $1 FOR UPDATE`,
        [campaignId]
      );

      if (campRes.rows.length === 0) {
        throw new Error('Campaign not found');
      }
      const campaign = campRes.rows[0];

      // 2. Segmentar audiencia omitiendo supresión y no-suscritos
      const contactsRes = await client.query(
        `SELECT mc.id, mc.email, mc.first_name, mc.last_name, mc.custom_metadata
         FROM marketing_contacts mc
         WHERE mc.audience_id = $1
           AND mc.is_subscribed = true
           AND mc.bounced = false
           AND mc.email NOT IN (SELECT email FROM marketing_suppression_list)`,
        [campaign.audience_id]
      );

      const contacts = contactsRes.rows;
      if (contacts.length === 0) {
        throw new Error('No eligible contacts found for this audience.');
      }

      await client.query(
        `UPDATE marketing_campaigns
         SET status = 'PROCESSING', total_recipients = $1, started_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [contacts.length, campaignId]
      );

      // 3. Crear logs de envío e inyectar trabajos en BullMQ
      let queuedCount = 0;
      for (const contact of contacts) {
        const logRes = await client.query(
          `INSERT INTO marketing_email_logs (campaign_id, contact_id, status)
           VALUES ($1, $2, 'PENDING') RETURNING id`,
          [campaignId, contact.id]
        );
        const logId = logRes.rows[0].id;

        // Variables dinámicas
        let personalizedHtml = campaign.html_body
          .replace(/\{\{\s*first_name\s*\}\}/g, contact.first_name || 'Cliente')
          .replace(/\{\{\s*email\s*\}\}/g, contact.email);

        const openTrackingPixel = `<img src="${baseUrl}/api/v1/marketing/track/open/${logId}" width="1" height="1" style="display:none" alt="" />`;
        personalizedHtml += openTrackingPixel;

        const unsubscribeUrl = `${baseUrl}/api/v1/marketing/unsubscribe/${contact.id}`;

        await this.emailQueue.add(
          'send-email',
          {
            campaignId,
            contactId: contact.id,
            logId,
            recipientEmail: contact.email,
            subject: campaign.subject,
            htmlBody: personalizedHtml,
            plainTextBody: campaign.plain_text_body,
            unsubscribeUrl
          }
        );
        queuedCount++;
      }

      await client.query('COMMIT');

      this.io.to(`project:${campaign.project_id}`).emit('CAMPAIGN_TELEMETRY_PULSE', {
        campaignId,
        status: 'PROCESSING',
        totalRecipients: queuedCount,
        sentCount: 0
      });

      return { queuedCount };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Comprobar regla del 95% para mutar el nodo de marketing del DAG a GREEN
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
        // Mudar nodos de categoría marketing a GREEN
        const nodeUpdate = await this.pool.query(
          `UPDATE workflow_nodes
           SET status = 'GREEN', completed_at = CURRENT_TIMESTAMP
           WHERE workflow_id IN (SELECT id FROM project_workflows WHERE project_id = $1)
             AND category = 'marketing'
             AND status != 'GREEN'
           RETURNING id, title`,
          [project_id]
        );

        for (const n of nodeUpdate.rows) {
          this.io.to(`project:${project_id}`).emit('WORKFLOW_NODE_TRANSITION', {
            nodeId: n.id,
            title: n.title,
            status: 'GREEN',
            reason: 'MARKETING_CAMPAIGN_DELIVERY_SUCCESS_THRESHOLD'
          });
        }
        return true;
      }
    }
    return false;
  }
}
