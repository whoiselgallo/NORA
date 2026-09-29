import { Request, Response } from 'express';
import crypto from 'crypto';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';

export class GitHubWebhookHandler {
  constructor(private pool: Pool, private io: SocketIOServer) {}

  public handleWebhook = async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    const signature = req.headers['x-hub-signature-256'] as string;
    const event = req.headers['x-github-event'] as string;
    const deliveryId = req.headers['x-github-delivery'] as string;
    const secret = process.env.GITHUB_WEBHOOK_SECRET;

    if (!secret || !signature) {
      res.status(401).json({ error: 'Unauthorized: Missing signature or secret' });
      return;
    }

    // 1. Verificación segura HMAC SHA-256 con timingSafeEqual sobre rawBody
    const rawBody = (req as any).rawBody as Buffer;
    if (!rawBody) {
      res.status(400).json({ error: 'Missing rawBody buffer' });
      return;
    }

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(rawBody);
    const expectedSignature = `sha256=${hmac.digest('hex')}`;

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      res.status(401).json({ error: 'Unauthorized: Invalid signature' });
      return;
    }

    const payload = req.body;
    const repoFullName = payload?.repository?.full_name;

    if (!repoFullName) {
      res.status(400).json({ error: 'Repository payload missing' });
      return;
    }

    const client = await this.pool.connect();
    try {
      // Localizar proyecto por repositorio
      const projectRes = await client.query(
        `SELECT id FROM projects WHERE github_repo = $1 LIMIT 1`,
        [repoFullName]
      );

      if (projectRes.rows.length === 0) {
        res.status(404).json({ error: 'Project not linked to this repository' });
        return;
      }

      const projectId = projectRes.rows[0].id;
      let conclusion: string | null = null;
      let durationMs: number | null = null;
      let commitSha: string | null = null;
      let branch: string | null = null;

      // 2. Procesar workflow_run
      if (event === 'workflow_run') {
        const run = payload.workflow_run;
        conclusion = run.conclusion; // "success" | "failure" | "cancelled"
        commitSha = run.head_sha;
        branch = run.head_branch;

        if (run.created_at && run.updated_at) {
          durationMs = new Date(run.updated_at).getTime() - new Date(run.created_at).getTime();
        }

        // Si conclusion == "success", evaluar y actualizar nodos automáticos a GREEN
        if (conclusion === 'success') {
          const updateRes = await client.query(
            `UPDATE workflow_nodes
             SET status = 'GREEN', updated_at = CURRENT_TIMESTAMP
             WHERE workflow_id IN (SELECT id FROM project_workflows WHERE project_id = $1)
               AND is_automated_github = true
             RETURNING id, slug, status`,
            [projectId]
          );

          for (const node of updateRes.rows) {
            this.io.to(`project:${projectId}`).emit('WORKFLOW_NODE_TRANSITION', {
              nodeId: node.id,
              slug: node.slug,
              status: node.status,
              reason: 'GITHUB_WORKFLOW_RUN_SUCCESS'
            });
          }
        }
      }

      const latencyMs = Date.now() - startTime;

      // 3. Registrar latencia y métricas en github_telemetry_events
      await client.query(
        `INSERT INTO github_telemetry_events 
          (project_id, event_type, event_action, delivery_id, commit_sha, branch, conclusion, duration_ms, latency_ms, raw_payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          projectId,
          event,
          payload.action || null,
          deliveryId,
          commitSha,
          branch,
          conclusion,
          durationMs,
          latencyMs,
          JSON.stringify(payload)
        ]
      );

      // 4. Emitir pulsos por WebSocket a la sala del proyecto
      this.io.to(`project:${projectId}`).emit('TELEMETRY_PULSE', {
        projectId,
        event,
        conclusion,
        durationMs,
        latencyMs,
        timestamp: new Date().toISOString()
      });

      res.status(200).json({ status: 'ACKNOWLEDGED', latencyMs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  };
}
