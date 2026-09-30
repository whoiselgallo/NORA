import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { BlueprintEngineService } from '../services/blueprintEngine.service';
import { TaskManagerService } from '../services/taskManager.service';
import { GitHubWebhookHandler } from '../webhooks/github.handler';
import { CampaignDispatcherService } from '../services/campaignDispatcher.service';
import { createMarketingRouter } from './marketing.routes';

export function createApiRouter(pool: Pool, io: SocketIOServer): Router {
  const router = Router();
  const taskService = new TaskManagerService(pool, io);
  const webhookHandler = new GitHubWebhookHandler(pool, io);
  const campaignDispatcher = new CampaignDispatcherService(pool, io);

  // Subrutas de Marketing
  router.use('/marketing', createMarketingRouter(pool, io, campaignDispatcher));

  // FASE 3: Ruta Webhook GitHub
  router.post('/telemetry/github', webhookHandler.handleWebhook);

  // FASE 2: Crear proyecto y generar Blueprint automáticamente
  router.post('/projects', async (req: Request, res: Response) => {
    const { name, description, github_repo_owner, github_repo_name, github_repo, tech_stack } = req.body;
    const repoOwner = github_repo_owner || (github_repo ? github_repo.split('/')[0] : 'unknown');
    const repoName = github_repo_name || (github_repo ? github_repo.split('/')[1] : 'unknown');

    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

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
      res.status(201).json({ project, blueprint });
    } catch (err: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // FASE 4: Listar y Mutar estado de tareas
  router.get('/projects/:projectId/tasks', async (req: Request, res: Response) => {
    try {
      const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;
      const tasks = await taskService.getProjectTasks(projectId);
      res.json(tasks);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/tasks/:taskId/status', async (req: Request, res: Response) => {
    const { status, user_role = 'COLLABORATOR' } = req.body;
    if (!status || !['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'].includes(status)) {
      res.status(400).json({ error: 'Valid status is required (TODO, IN_PROGRESS, REVIEW, DONE)' });
      return;
    }

    try {
      const taskId = Array.isArray(req.params.taskId) ? req.params.taskId[0] : req.params.taskId;
      const result = await taskService.updateTaskStatus(taskId, status, user_role);
      res.json(result);
    } catch (err: any) {
      if (err.message.includes('FORBIDDEN')) {
        res.status(403).json({ error: err.message });
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  });

  // FASE 5: Obtener nodos y conexiones para React Flow
  router.get('/projects/:projectId/workflow', async (req: Request, res: Response) => {
    try {
      const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;
      const workflowRes = await pool.query(
        `SELECT * FROM project_workflows WHERE project_id = $1 LIMIT 1`,
        [projectId]
      );

      if (workflowRes.rows.length === 0) {
        res.status(404).json({ error: 'Workflow not found for this project' });
        return;
      }
      const workflowId = workflowRes.rows[0].id;

      const nodesRes = await pool.query(
        `SELECT id, title, label, category, status, is_automated_github, position_x, position_y
         FROM workflow_nodes
         WHERE workflow_id = $1
         ORDER BY position_x ASC`,
        [workflowId]
      );

      const edgesRes = await pool.query(
        `SELECT id, source_node_id, target_node_id FROM workflow_edges WHERE workflow_id = $1`,
        [workflowId]
      );

      res.json({
        workflow: workflowRes.rows[0],
        nodes: nodesRes.rows,
        edges: edgesRes.rows
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
