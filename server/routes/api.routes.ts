import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { BlueprintEngineService } from '../services/blueprintEngine.service';
import { TaskManagerService } from '../services/taskManager.service';
import { GitHubWebhookHandler } from '../webhooks/github.handler';
import { CampaignDispatcherService } from '../services/campaignDispatcher.service';
import { DagCacheService } from '../services/dagCache.service';
import { createMarketingRouter } from './marketing.routes';
import { createAIRoutes } from './ai.routes';
import { authenticateNeonAuth, requireRole } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  TaskCreateSchema,
  TaskStatusUpdateSchema,
  CreateProjectSchema
} from '../validation/schemas';

export function createApiRouter(
  pool: Pool,
  io: SocketIOServer,
  dagCacheService?: DagCacheService
): Router {
  const router = Router();
  const cache = dagCacheService || new DagCacheService();
  const taskService = new TaskManagerService(pool, io, cache);
  const webhookHandler = new GitHubWebhookHandler(pool, io, cache);
  const campaignDispatcher = new CampaignDispatcherService(pool, io, undefined, cache);

  // Subrutas de Marketing
  router.use('/marketing', createMarketingRouter(pool, io, campaignDispatcher));

  // Capa Centralizada AI Gateway (Orquestador de IA)
  router.use('/ai', createAIRoutes(pool, io));

  // Webhook GitHub (Valida HMAC internamente y payload con GitHubWebhookSchema)
  router.post('/telemetry/github', webhookHandler.handleWebhook);

  // Crear proyecto y generar Blueprint automáticamente
  router.post(
    '/projects',
    authenticateNeonAuth,
    requireRole(['ADMIN', 'COLLABORATOR']),
    validateBody(CreateProjectSchema),
    async (req: Request, res: Response) => {
      const { name, description, github_repo_owner, github_repo_name, github_repo, tech_stack } = req.body;
      const repoOwner = github_repo_owner || (github_repo ? github_repo.split('/')[0] : 'unknown');
      const repoName = github_repo_name || (github_repo ? github_repo.split('/')[1] : 'unknown');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const projectRes = await client.query(
          `INSERT INTO projects (name, description, github_repo, github_repo_owner, github_repo_name, tech_stack)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [name, description || null, `${repoOwner}/${repoName}`, repoOwner, repoName, JSON.stringify(tech_stack || {})]
        );
        const project = projectRes.rows[0];

        // Disparar motor Blueprint DAG
        const blueprint = await BlueprintEngineService.generate(
          client,
          project.id,
          tech_stack || {}
        );

        await client.query('COMMIT');

        // Invalidar caché del DAG del proyecto recién creado
        await cache.invalidateDag(project.id);

        res.status(201).json({ project, blueprint });
      } catch (err: any) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
      } finally {
        client.release();
      }
    }
  );

  // Listar tareas del proyecto (accesible por ADMIN, COLLABORATOR y CLIENT)
  router.get(
    '/projects/:projectId/tasks',
    authenticateNeonAuth,
    async (req: Request, res: Response) => {
      try {
        const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;
        const tasks = await taskService.getProjectTasks(projectId);
        res.json(tasks);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // Crear tarea del proyecto (restringido a ADMIN y COLLABORATOR; CLIENT recibe 403 Forbidden)
  router.post(
    '/projects/:projectId/tasks',
    authenticateNeonAuth,
    requireRole(['ADMIN', 'COLLABORATOR']),
    validateBody(TaskCreateSchema),
    async (req: Request, res: Response) => {
      const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;
      const { title, description, priority = 'MEDIUM', node_id, assigned_to, due_date } = req.body;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const insertTaskRes = await client.query(
          `INSERT INTO project_tasks (project_id, title, description, priority, status, assigned_to, due_date)
           VALUES ($1, $2, $3, $4, 'TODO', $5, $6)
           RETURNING *`,
          [projectId, title, description || null, priority, assigned_to || null, due_date || null]
        );
        const newTask = insertTaskRes.rows[0];

        if (node_id) {
          await client.query(
            `INSERT INTO workflow_node_tasks (node_id, task_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [node_id, newTask.id]
          );
        }

        await client.query('COMMIT');
        io.to(`project:${projectId}`).emit('TASK_CREATED', newTask);
        res.status(201).json({ success: true, task: newTask });
      } catch (err: any) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
      } finally {
        client.release();
      }
    }
  );

  // Mutar estado de una tarea (restringido a ADMIN y COLLABORATOR; CLIENT recibe 403 Forbidden)
  router.patch(
    '/tasks/:taskId/status',
    authenticateNeonAuth,
    requireRole(['ADMIN', 'COLLABORATOR']),
    validateBody(TaskStatusUpdateSchema),
    async (req: Request, res: Response) => {
      const { status } = req.body;
      const userRole = req.user!.role;

      try {
        const taskId = Array.isArray(req.params.taskId) ? req.params.taskId[0] : req.params.taskId;
        const result = await taskService.updateTaskStatus(taskId, status, userRole);
        res.json(result);
      } catch (err: any) {
        if (err.message.includes('FORBIDDEN')) {
          res.status(403).json({ error: err.message });
        } else {
          res.status(500).json({ error: err.message });
        }
      }
    }
  );

  // Obtener topología DAG con caché en Redis (TTL 24h, cache-hit inmediato, miss -> DB)
  router.get(
    '/projects/:projectId/workflow',
    authenticateNeonAuth,
    async (req: Request, res: Response) => {
      try {
        const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;
        const { data, cached } = await cache.getOrFetchDag(pool, projectId);

        res.setHeader('X-Cache', cached ? 'HIT' : 'MISS');
        res.json({
          workflow: data.workflow,
          nodes: data.nodes,
          edges: data.edges,
          cached
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  return router;
}
