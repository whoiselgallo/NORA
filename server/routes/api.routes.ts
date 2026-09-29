import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { BlueprintEngineService } from '../services/blueprintEngine.service';
import { TaskManagerService } from '../services/taskManager.service';
import { GitHubWebhookHandler } from '../webhooks/github.handler';

export function createApiRouter(pool: Pool, io: SocketIOServer): Router {
  const router = Router();
  const taskService = new TaskManagerService(pool, io);
  const webhookHandler = new GitHubWebhookHandler(pool, io);

  // FASE 3: Ruta Webhook GitHub
  router.post('/telemetry/github', webhookHandler.handleWebhook);

  // FASE 2: Crear proyecto y generar Blueprint automáticamente
  router.post('/projects', async (req: Request, res: Response) => {
    const { name, github_repo, tech_stack } = req.body;
    if (!name || !github_repo) {
      res.status(400).json({ error: 'name and github_repo are required' });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const projectRes = await client.query(
        `INSERT INTO projects (name, github_repo, tech_stack)
         VALUES ($1, $2, $3) RETURNING *`,
        [name, github_repo, JSON.stringify(tech_stack || {})]
      );
      const project = projectRes.rows[0];

      // Disparar motor Blueprint
      const blueprint = await BlueprintEngineService.generateProjectBlueprint(
        client,
        project.id,
        project.name,
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
    if (!status || !['TODO', 'IN_PROGRESS', 'DONE'].includes(status)) {
      res.status(400).json({ error: 'Valid status is required (TODO, IN_PROGRESS, DONE)' });
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
        `SELECT id, slug, label, description, step_order, status, is_automated_github, position_x, position_y
         FROM workflow_nodes
         WHERE workflow_id = $1
         ORDER BY step_order ASC`,
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
