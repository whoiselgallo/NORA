import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { CampaignDispatcherService } from '../services/campaignDispatcher.service';
import { authenticateNeonAuth, requireRole } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  CreateCampaignSchema,
  CreateTemplateSchema,
  SubscribeContactSchema,
  ProviderWebhookSchema
} from '../validation/schemas';

export function createMarketingRouter(
  pool: Pool,
  io: SocketIOServer,
  dispatcher: CampaignDispatcherService
): Router {
  const router = Router();

  const TRANSPARENT_1X1_GIF = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );

  // 1. Crear plantilla de marketing (validación estricta Zod y autenticación de roles)
  router.post(
    '/templates',
    authenticateNeonAuth,
    requireRole(['ADMIN', 'COLLABORATOR']),
    validateBody(CreateTemplateSchema),
    async (req: Request, res: Response) => {
      const { project_id, name, subject, preview_text, html_body, plain_text_body } = req.body;
      try {
        const result = await pool.query(
          `INSERT INTO marketing_templates (project_id, name, subject, preview_text, html_body, plain_text_body)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [project_id, name, subject, preview_text || null, html_body, plain_text_body || null]
        );
        res.status(201).json(result.rows[0]);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 2. Crear campaña de marketing (validación estricta Zod)
  router.post(
    '/campaigns',
    authenticateNeonAuth,
    requireRole(['ADMIN', 'COLLABORATOR']),
    validateBody(CreateCampaignSchema),
    async (req: Request, res: Response) => {
      const { project_id, template_id, audience_id, name } = req.body;
      try {
        const result = await pool.query(
          `INSERT INTO marketing_campaigns (project_id, template_id, audience_id, name, status)
           VALUES ($1, $2, $3, $4, 'DRAFT')
           RETURNING *`,
          [project_id, template_id, audience_id, name]
        );
        res.status(201).json(result.rows[0]);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 3. Suscripción de contacto a lista de audiencia (validación estricta de email)
  router.post(
    '/contacts/subscribe',
    validateBody(SubscribeContactSchema),
    async (req: Request, res: Response) => {
      const { audience_id, email, first_name, last_name, custom_metadata } = req.body;
      try {
        const result = await pool.query(
          `INSERT INTO marketing_contacts (audience_id, email, first_name, last_name, custom_metadata, is_subscribed)
           VALUES ($1, $2, $3, $4, $5, true)
           ON CONFLICT (audience_id, email)
           DO UPDATE SET is_subscribed = true, unsubscribed_at = NULL, bounced = false
           RETURNING *`,
          [audience_id, email, first_name || null, last_name || null, JSON.stringify(custom_metadata || {})]
        );
        res.status(201).json({ success: true, contact: result.rows[0] });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 4. Tracking de Apertura (Píxel transparente 1x1)
  router.get('/track/open/:logId', async (req: Request, res: Response) => {
    const { logId } = req.params;

    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': TRANSPARENT_1X1_GIF.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private'
    });
    res.end(TRANSPARENT_1X1_GIF);

    try {
      const logRes = await pool.query(
        `UPDATE marketing_email_logs
         SET status = 'OPENED', opened_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND opened_at IS NULL
         RETURNING campaign_id`,
        [logId]
      );

      if (logRes.rows.length > 0) {
        const campaignId = logRes.rows[0].campaign_id;
        const campRes = await pool.query(
          `UPDATE marketing_campaigns
           SET opened_count = opened_count + 1
           WHERE id = $1
           RETURNING project_id, opened_count, clicked_count`,
          [campaignId]
        );

        const camp = campRes.rows[0];
        io.to(`project:${camp.project_id}`).emit('CAMPAIGN_TELEMETRY_PULSE', {
          campaignId,
          openedCount: camp.opened_count,
          clickedCount: camp.clicked_count
        });
      }
    } catch (err) {
      console.error('Error tracking open:', err);
    }
  });

  // 5. Tracking de Clic y Redirección 302
  router.get('/track/click/:logId', async (req: Request, res: Response) => {
    const { logId } = req.params;
    const targetUrl = (req.query.url as string) || 'https://google.com';

    res.redirect(302, targetUrl);

    try {
      const logRes = await pool.query(
        `UPDATE marketing_email_logs
         SET status = 'CLICKED', clicked_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING campaign_id`,
        [logId]
      );

      if (logRes.rows.length > 0) {
        const campaignId = logRes.rows[0].campaign_id;
        const campRes = await pool.query(
          `UPDATE marketing_campaigns
           SET clicked_count = clicked_count + 1
           WHERE id = $1
           RETURNING project_id, opened_count, clicked_count`,
          [campaignId]
        );

        const camp = campRes.rows[0];
        io.to(`project:${camp.project_id}`).emit('CAMPAIGN_TELEMETRY_PULSE', {
          campaignId,
          openedCount: camp.opened_count,
          clickedCount: camp.clicked_count
        });
      }
    } catch (err) {
      console.error('Error tracking click:', err);
    }
  });

  // 6. Webhook de Rebotes y Spam del Proveedor (Validado con Zod)
  router.post(
    '/webhooks/provider',
    validateBody(ProviderWebhookSchema),
    async (req: Request, res: Response) => {
      const { event, email } = req.body;

      try {
        let reason: 'HARD_BOUNCE' | 'SPAM_COMPLAINT' = 'HARD_BOUNCE';
        if (event === 'complaint' || event === 'spam') {
          reason = 'SPAM_COMPLAINT';
        }

        await pool.query(
          `INSERT INTO marketing_suppression_list (email, reason)
           VALUES ($1, $2)
           ON CONFLICT (email) DO UPDATE SET reason = EXCLUDED.reason`,
          [email, reason]
        );

        await pool.query(
          `UPDATE marketing_contacts
           SET bounced = true, is_subscribed = false
           WHERE email = $1`,
          [email]
        );

        res.status(200).json({ status: 'PROCESSED' });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 7. Cancelación de Suscripción (Unsubscribe RFC 8058)
  router.post('/unsubscribe/:contactId', async (req: Request, res: Response) => {
    const { contactId } = req.params;

    try {
      const contactRes = await pool.query(
        `UPDATE marketing_contacts
         SET is_subscribed = false, unsubscribed_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING email`,
        [contactId]
      );

      if (contactRes.rows.length > 0) {
        const email = contactRes.rows[0].email;
        await pool.query(
          `INSERT INTO marketing_suppression_list (email, reason)
           VALUES ($1, 'UNSUBSCRIBED')
           ON CONFLICT (email) DO NOTHING`,
          [email]
        );
      }

      res.status(200).send('<h3>Te has desuscrito exitosamente de esta lista de correos.</h3>');
    } catch (err: any) {
      res.status(500).send('Error procesando desuscripción.');
    }
  });

  // 8. Disparador de Campaña por Lotes (BullMQ Batching)
  router.post(
    '/campaigns/:campaignId/dispatch',
    authenticateNeonAuth,
    requireRole(['ADMIN', 'COLLABORATOR']),
    async (req: Request, res: Response) => {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const campaignId = Array.isArray(req.params.campaignId) ? req.params.campaignId[0] : req.params.campaignId;
      try {
        const result = await dispatcher.dispatchCampaign(campaignId, baseUrl);
        res.status(200).json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  return router;
}
