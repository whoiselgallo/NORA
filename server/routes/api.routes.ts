import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { BlueprintEngineService } from '../services/blueprintEngine.service';
import { TaskManagerService } from '../services/taskManager.service';
import { GitHubWebhookHandler } from '../webhooks/github.handler';
import { MasterWebhookHandler } from '../webhooks/master.handler';
import { CampaignDispatcherService } from '../services/campaignDispatcher.service';
import { DagCacheService } from '../services/dagCache.service';
import { CalendarService } from '../services/calendar.service';
import { AgileService } from '../services/agile.service';
import { OpexService } from '../services/opex.service';
import { NotesService } from '../services/notes.service';
import { OrchestratorService } from '../services/orchestrator.service';
import { DmaicService, DmaicPhaseType } from '../services/dmaic.service';
import { BrandEnforcerService } from '../services/brandEnforcer.service';
import { ProjectClosureService } from '../services/projectClosure.service';
import { NexusBrainService } from '../services/nexusBrain.service';
import { NexusOnboardingService } from '../services/nexusOnboarding.service';
import { createMarketingRouter } from './marketing.routes';
import { createAIRoutes } from './ai.routes';
import { createPresentationRoutes } from './presentation.routes';
import { createNexusStudioRouter } from './nexusStudio.routes';
import { authenticateNeonAuth, requireRole } from '../middleware/auth.middleware';
import { requireWorkspace, DEFAULT_WORKSPACE_ID, withWorkspaceClient } from '../middleware/workspace.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  TaskCreateSchema,
  TaskStatusUpdateSchema,
  CreateProjectSchema,
  CreateWorkspaceSchema,
  CreateCalendarEventSchema,
  CreateSprintSchema,
  MoveKanbanCardSchema,
  CreateGanttDependencySchema,
  RescheduleGanttTaskSchema,
  CreateFiveWhysSchema,
  CreateIshikawaDiagramSchema,
  AddIshikawaFactorSchema,
  CreateSwotItemSchema,
  CreateParetoDataSchema,
  CreateNoteSchema,
  UpdateNoteSchema,
  MasterWebhookPayloadSchema,
  UpdateDmaicPhaseSchema,
  ApproveTollgateSchema,
  CreateCorrectiveActionSchema,
  CompileDeliverableSchema,
  ProjectCloseSchema,
  NexusQuerySchema,
  NexusOnboardingSessionSchema
} from '../validation/schemas';

export function createApiRouter(
  pool: Pool,
  io: SocketIOServer,
  dagCacheService?: DagCacheService
): Router {
  const router = Router();
  const cache = dagCacheService || new DagCacheService();
  const orchestrator = new OrchestratorService(pool, io);
  const dmaicService = new DmaicService(pool, orchestrator);
  const brandEnforcerService = new BrandEnforcerService(pool);
  const taskService = new TaskManagerService(pool, io, cache, orchestrator);
  const webhookHandler = new GitHubWebhookHandler(pool, io, cache);
  const campaignDispatcher = new CampaignDispatcherService(pool, io, undefined, cache);
  const masterWebhookHandler = new MasterWebhookHandler(pool, io, cache, dmaicService, orchestrator, campaignDispatcher);
  const calendarService = new CalendarService(pool);
  const agileService = new AgileService(pool);
  const opexService = new OpexService(pool);
  const notesService = new NotesService(pool, io);
  const projectClosureService = new ProjectClosureService(pool, io, cache);
  const nexusBrainService = new NexusBrainService(pool, io);
  const nexusOnboardingService = new NexusOnboardingService(pool, io);

  // Middleware global de aislamiento multi-tenant de Workspace
  router.use(requireWorkspace(pool));

  // ==========================================================================
  // WEBHOOKS
  // ==========================================================================
  // Webhook Master centralizado para telemetría CI/CD y alertas de calendario
  router.post(
    '/webhooks/master/:routingKey',
    validateBody(MasterWebhookPayloadSchema),
    masterWebhookHandler.handleMasterWebhook
  );

  // Webhook GitHub Telemetry
  router.post('/telemetry/github', webhookHandler.handleWebhook);

  // Subrutas de Marketing, AI Gateway & Nexus Architect Studio
  router.use('/marketing', createMarketingRouter(pool, io, campaignDispatcher));
  router.use('/ai', createAIRoutes(pool, io));
  router.use('/presentations', createPresentationRoutes(pool, io));
  router.use(createNexusStudioRouter(pool, io));

  // ==========================================================================
  // 1. WORKSPACES MULTI-TENANT
  // ==========================================================================
  router.get('/workspaces', authenticateNeonAuth, async (_req: Request, res: Response) => {
    try {
      const result = await pool.query(`SELECT * FROM workspaces ORDER BY created_at DESC`);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post(
    '/workspaces',
    authenticateNeonAuth,
    requireRole('ADMIN'),
    validateBody(CreateWorkspaceSchema),
    async (req: Request, res: Response) => {
      const { name, slug, description } = req.body;
      try {
        const result = await pool.query(
          `INSERT INTO workspaces (name, slug, description)
           VALUES ($1, $2, $3)
           RETURNING *`,
          [name, slug, description || null]
        );
        res.status(201).json(result.rows[0]);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  router.get('/workspaces/current', async (req: Request, res: Response) => {
    const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
    try {
      const result = await pool.query(`SELECT * FROM workspaces WHERE id = $1`, [wsId]);
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Active workspace not found' });
        return;
      }
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================================================
  // 2. PROYECTOS & WORKFLOWS CON AISLAMIENTO RLS
  // ==========================================================================
  router.post(
    '/projects',
    authenticateNeonAuth,
    requireRole(['ADMIN', 'COLLABORATOR']),
    validateBody(CreateProjectSchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const { name, description, github_repo_owner, github_repo_name, github_repo, tech_stack } = req.body;
      const repoOwner = github_repo_owner || (github_repo ? github_repo.split('/')[0] : 'unknown');
      const repoName = github_repo_name || (github_repo ? github_repo.split('/')[1] : 'unknown');

      try {
        const { project, blueprint } = await withWorkspaceClient(pool, wsId, async (client) => {
          const projectRes = await client.query(
            `INSERT INTO projects (workspace_id, name, description, github_repo, github_repo_owner, github_repo_name, tech_stack)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [wsId, name, description || null, `${repoOwner}/${repoName}`, repoOwner, repoName, JSON.stringify(tech_stack || {})]
          );
          const newProj = projectRes.rows[0];

          const bp = await BlueprintEngineService.generate(client, newProj.id, tech_stack || {});
          return { project: newProj, blueprint: bp };
        });

        await cache.invalidateDag(project.id, wsId);
        res.status(201).json({ project, blueprint });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  router.get('/projects/:projectId/workflow', authenticateNeonAuth, async (req: Request, res: Response) => {
    const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
    const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;

    try {
      const { data, cached } = await cache.getOrFetchDag(pool, projectId, wsId);
      res.setHeader('X-Cache', cached ? 'HIT' : 'MISS');
      res.json({
        workflow: data.workflow,
        nodes: data.nodes,
        edges: data.edges,
        cached,
        workspaceId: wsId
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // CIERRE FORMAL, SNAPSHOT INMUTABLE & BIBLIOTECA DE ARCHIVADOS
  // --------------------------------------------------------------------------
  router.get('/projects/archived', authenticateNeonAuth, async (req: Request, res: Response) => {
    const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
    const { stack, minRating, startDate, endDate, search } = req.query as {
      stack?: string;
      minRating?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    };

    try {
      const archived = await projectClosureService.getArchivedProjects(wsId, {
        stack,
        minRating: minRating ? parseInt(minRating, 10) : undefined,
        startDate,
        endDate,
        search
      });
      res.json(archived);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post(
    '/projects/:projectId/close',
    authenticateNeonAuth,
    requireRole(['ADMIN', 'COLLABORATOR']),
    validateBody(ProjectCloseSchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;
      const closedBy = req.user?.sub || null;

      try {
        const result = await projectClosureService.closeAndArchiveProject(
          wsId,
          projectId,
          req.body,
          closedBy
        );
        res.status(201).json({ success: true, ...result });
      } catch (err: any) {
        if (err.message.includes('PROJECT_ALREADY_ARCHIVED')) {
          res.status(409).json({ error: err.message });
        } else {
          res.status(500).json({ error: err.message });
        }
      }
    }
  );

  router.get('/projects/:projectId/snapshot', authenticateNeonAuth, async (req: Request, res: Response) => {
    const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
    const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;

    try {
      const snapshot = await projectClosureService.getProjectSnapshot(wsId, projectId);
      res.json(snapshot);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // CEREBRO DE CONOCIMIENTO CONTINUO DE NEXUS (PGVECTOR & RAG)
  // --------------------------------------------------------------------------
  router.post(
    '/nexus/query',
    authenticateNeonAuth,
    validateBody(NexusQuerySchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const { query, min_similarity, domain_filter } = req.body;

      try {
        const result = await nexusBrainService.queryNexus(
          wsId,
          query,
          min_similarity,
          domain_filter
        );
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  router.get('/nexus/suggestions/ishikawa', authenticateNeonAuth, async (req: Request, res: Response) => {
    const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
    const { problem, category } = req.query as { problem?: string; category?: string };

    try {
      const suggestions = await nexusBrainService.suggestPreventiveIshikawa(
        wsId,
        problem || 'Fricción operativa y mitigación de fallos técnicos',
        category
      );
      res.json(suggestions);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/nexus/stats', authenticateNeonAuth, async (req: Request, res: Response) => {
    const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
    try {
      const stats = await nexusBrainService.getNexusStats(wsId);
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // MOTOR DE ONBOARDING ASISTIDO POR NEXUS, CONTRATOS & GRAFOS DAG
  // --------------------------------------------------------------------------
  router.get('/nexus/onboarding/catalog', async (_req: Request, res: Response) => {
    try {
      const catalog = await nexusOnboardingService.getServiceCatalog();
      res.json(catalog);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post(
    '/nexus/onboarding/session',
    validateBody(NexusOnboardingSessionSchema),
    async (req: Request, res: Response) => {
      try {
        const creatorUserId = (req.user as any)?.sub || null;
        const result = await nexusOnboardingService.processOnboardingSession(req.body, creatorUserId);
        res.status(201).json({
          success: true,
          message: 'Espacio de trabajo, contrato oficial y topología DAG aprovisionados exitosamente por Nexus.',
          ...result
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  router.get('/nexus/onboarding/contract/:projectId', authenticateNeonAuth, async (req: Request, res: Response) => {
    const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
    const projectId = req.params.projectId as string;
    try {
      const contract = await nexusOnboardingService.getProjectContract(wsId, projectId);
      if (!contract) {
        res.status(404).json({ error: 'Contrato comercial no encontrado para el proyecto especificado.' });
        return;
      }
      res.json(contract);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================================================
  // 3. TAREAS DEL PROYECTO & SINCRONIZACIÓN CON CALENDARIO
  // ==========================================================================
  router.get('/projects/:projectId/tasks', authenticateNeonAuth, async (req: Request, res: Response) => {
    const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
    const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;

    try {
      const tasks = await taskService.getProjectTasks(projectId, wsId);
      res.json(tasks);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post(
    '/projects/:projectId/tasks',
    authenticateNeonAuth,
    requireRole(['ADMIN', 'COLLABORATOR']),
    validateBody(TaskCreateSchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;
      const { title, description, priority = 'MEDIUM', node_id, assigned_to, sprint_id, story_points, start_date, due_date } = req.body;

      try {
        const newTask = await withWorkspaceClient(pool, wsId, async (client) => {
          // Bloqueo inmutable si el proyecto está ARCHIVADO
          const pCheck = await client.query('SELECT status FROM projects WHERE id = $1', [projectId]);
          if (pCheck.rows[0]?.status === 'ARCHIVED') {
            throw new Error('PROJECT_IS_ARCHIVED_READ_ONLY: El proyecto está formalmente archivado en modo inmutable. No se admiten nuevas tareas.');
          }

          const insertTaskRes = await client.query(
            `INSERT INTO project_tasks (
              workspace_id, project_id, title, description, priority, status,
              assigned_to, sprint_id, story_points, start_date, due_date
            ) VALUES ($1, $2, $3, $4, $5, 'TODO', $6, $7, $8, $9, $10)
            RETURNING *`,
            [
              wsId,
              projectId,
              title,
              description || null,
              priority,
              assigned_to || null,
              sprint_id || null,
              story_points || 0,
              start_date || null,
              due_date || null
            ]
          );
          const task = insertTaskRes.rows[0];

          if (node_id) {
            await client.query(
              `INSERT INTO workflow_node_tasks (node_id, task_id)
               VALUES ($1, $2) ON CONFLICT DO NOTHING`,
              [node_id, task.id]
            );
          }

          // Sincronizar automáticamente fechas con calendar_events
          await calendarService.syncTaskEvent(client, task);

          return task;
        });

        io.to(`workspace_${wsId}`).emit('TASK_CREATED', newTask);
        io.to(`project:${projectId}`).emit('TASK_CREATED', newTask);
        res.status(201).json({ success: true, task: newTask });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  router.patch(
    '/tasks/:taskId/status',
    authenticateNeonAuth,
    requireRole(['ADMIN', 'COLLABORATOR']),
    validateBody(TaskStatusUpdateSchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const { status } = req.body;
      const userRole = req.user!.role;
      const taskId = Array.isArray(req.params.taskId) ? req.params.taskId[0] : req.params.taskId;

      try {
        const result = await taskService.updateTaskStatus(taskId, status, userRole, wsId);
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

  // ==========================================================================
  // 4. CALENDARIO MAESTRO (PERSPECTIVA GLOBAL Y POR PROYECTO)
  // ==========================================================================
  router.get('/calendar/events', authenticateNeonAuth, async (req: Request, res: Response) => {
    const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
    const { project_id, start_date, end_date } = req.query as {
      project_id?: string;
      start_date?: string;
      end_date?: string;
    };

    try {
      const events = await calendarService.getEvents(wsId, project_id, start_date, end_date);
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post(
    '/calendar/events',
    authenticateNeonAuth,
    requireRole(['ADMIN', 'COLLABORATOR']),
    validateBody(CreateCalendarEventSchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const { project_id, title, description, start_date, due_date, event_type, priority } = req.body;

      try {
        const event = await withWorkspaceClient(pool, wsId, async (client) => {
          const result = await client.query(
            `INSERT INTO calendar_events (
              workspace_id, project_id, title, description, start_date, due_date, event_type, priority
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
            [wsId, project_id || null, title, description || null, start_date, due_date, event_type, priority]
          );
          return result.rows[0];
        });

        io.to(`workspace_${wsId}`).emit('CALENDAR_EVENT_CREATED', event);
        res.status(201).json(event);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // ==========================================================================
  // 5. HERRAMIENTAS ÁGILES (SCRUM, KANBAN, GANTT)
  // ==========================================================================
  // Scrum Sprints
  router.post(
    '/agile/projects/:projectId/sprints',
    authenticateNeonAuth,
    requireRole(['ADMIN', 'COLLABORATOR']),
    validateBody(CreateSprintSchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;

      try {
        const sprint = await agileService.createSprint(wsId, projectId, req.body);
        io.to(`workspace_${wsId}`).emit('SPRINT_CREATED', sprint);
        res.status(201).json(sprint);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  router.get('/agile/projects/:projectId/sprints', authenticateNeonAuth, async (req: Request, res: Response) => {
    const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
    const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;

    try {
      const sprints = await agileService.getSprints(wsId, projectId);
      res.json(sprints);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get(
    '/agile/projects/:projectId/sprints/:sprintId/burndown',
    authenticateNeonAuth,
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;
      const sprintId = Array.isArray(req.params.sprintId) ? req.params.sprintId[0] : req.params.sprintId;

      try {
        const burndown = await agileService.getSprintBurndown(wsId, projectId, sprintId);
        res.json(burndown);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // Kanban
  router.get('/agile/projects/:projectId/kanban', authenticateNeonAuth, async (req: Request, res: Response) => {
    const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
    const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;

    try {
      const columns = await agileService.getKanbanColumns(wsId, projectId);
      res.json(columns);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch(
    '/agile/kanban/cards/reorder',
    authenticateNeonAuth,
    requireRole(['ADMIN', 'COLLABORATOR']),
    validateBody(MoveKanbanCardSchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const { task_id, target_column_id, new_position } = req.body;

      try {
        const result = await agileService.moveKanbanCard(wsId, task_id, target_column_id, new_position);
        io.to(`workspace_${wsId}`).emit('KANBAN_CARD_MOVED', result);
        res.json(result);
      } catch (err: any) {
        if (err.message.includes('WIP_LIMIT_EXCEEDED')) {
          res.status(422).json({ error: err.message });
        } else {
          res.status(500).json({ error: err.message });
        }
      }
    }
  );

  // Gantt
  router.get('/agile/projects/:projectId/gantt', authenticateNeonAuth, async (req: Request, res: Response) => {
    const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
    const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;

    try {
      const data = await agileService.getGanttData(wsId, projectId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post(
    '/agile/gantt/dependencies',
    authenticateNeonAuth,
    requireRole(['ADMIN', 'COLLABORATOR']),
    validateBody(CreateGanttDependencySchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const { predecessor_id, successor_id, dependency_type, lag_days } = req.body;

      try {
        const dep = await agileService.createGanttDependency(wsId, predecessor_id, successor_id, dependency_type, lag_days);
        io.to(`workspace_${wsId}`).emit('GANTT_DEPENDENCY_CREATED', dep);
        res.status(201).json(dep);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  router.get(
    '/agile/projects/:projectId/gantt/critical-path',
    authenticateNeonAuth,
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;

      try {
        const cp = await agileService.calculateCriticalPath(wsId, projectId);
        res.json(cp);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  router.patch(
    '/agile/gantt/tasks/:taskId/reschedule',
    authenticateNeonAuth,
    requireRole(['ADMIN', 'COLLABORATOR']),
    validateBody(RescheduleGanttTaskSchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const taskId = Array.isArray(req.params.taskId) ? req.params.taskId[0] : req.params.taskId;
      const { new_start_date, new_due_date } = req.body;

      try {
        const result = await agileService.rescheduleGanttTask(wsId, taskId, new_start_date, new_due_date);
        io.to(`workspace_${wsId}`).emit('GANTT_TASKS_RESCHEDULED', { taskId, ...result });
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // ==========================================================================
  // 6. HERRAMIENTAS OPEX Y DE CALIDAD
  // ==========================================================================
  // 5 Porqués
  router.post(
    '/opex/projects/:projectId/five-whys',
    authenticateNeonAuth,
    requireRole(['ADMIN', 'COLLABORATOR']),
    validateBody(CreateFiveWhysSchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;

      try {
        const item = await opexService.createFiveWhys(wsId, projectId, req.body);
        io.to(`workspace_${wsId}`).emit('OPEX_FIVE_WHYS_CREATED', item);
        res.status(201).json(item);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  router.get('/opex/projects/:projectId/five-whys', authenticateNeonAuth, async (req: Request, res: Response) => {
    const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
    const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;

    try {
      const items = await opexService.getFiveWhys(wsId, projectId);
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Ishikawa
  router.post(
    '/opex/projects/:projectId/ishikawa',
    authenticateNeonAuth,
    requireRole(['ADMIN', 'COLLABORATOR']),
    validateBody(CreateIshikawaDiagramSchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;

      try {
        const diagram = await opexService.createIshikawaDiagram(wsId, projectId, req.body);
        res.status(201).json(diagram);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  router.post(
    '/opex/ishikawa/:diagramId/factors',
    authenticateNeonAuth,
    requireRole(['ADMIN', 'COLLABORATOR']),
    validateBody(AddIshikawaFactorSchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const diagramId = Array.isArray(req.params.diagramId) ? req.params.diagramId[0] : req.params.diagramId;

      try {
        const factor = await opexService.addIshikawaFactor(wsId, diagramId, req.body);
        io.to(`workspace_${wsId}`).emit('ISHIKAWA_FACTOR_ADDED', factor);
        res.status(201).json(factor);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  router.post(
    '/opex/ishikawa/factors/:factorId/vote',
    authenticateNeonAuth,
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const factorId = Array.isArray(req.params.factorId) ? req.params.factorId[0] : req.params.factorId;

      try {
        const factor = await opexService.voteIshikawaFactor(wsId, factorId);
        io.to(`workspace_${wsId}`).emit('ISHIKAWA_FACTOR_VOTED', factor);
        res.json(factor);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  router.get('/opex/ishikawa/:diagramId', authenticateNeonAuth, async (req: Request, res: Response) => {
    const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
    const diagramId = Array.isArray(req.params.diagramId) ? req.params.diagramId[0] : req.params.diagramId;

    try {
      const details = await opexService.getIshikawaDiagramDetails(wsId, diagramId);
      res.json(details);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // FODA (SWOT)
  router.post(
    '/opex/projects/:projectId/swot',
    authenticateNeonAuth,
    requireRole(['ADMIN', 'COLLABORATOR']),
    validateBody(CreateSwotItemSchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;

      try {
        const item = await opexService.addSwotItem(wsId, projectId, req.body);
        io.to(`workspace_${wsId}`).emit('SWOT_ITEM_CREATED', item);
        res.status(201).json(item);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  router.get('/opex/projects/:projectId/swot', authenticateNeonAuth, async (req: Request, res: Response) => {
    const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
    const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;

    try {
      const items = await opexService.getSwotItems(wsId, projectId);
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Pareto (80/20)
  router.post(
    '/opex/projects/:projectId/pareto',
    authenticateNeonAuth,
    requireRole(['ADMIN', 'COLLABORATOR']),
    validateBody(CreateParetoDataSchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;

      try {
        const data = await opexService.recordParetoData(wsId, projectId, req.body);
        res.status(201).json(data);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  router.get('/opex/projects/:projectId/pareto/analysis', authenticateNeonAuth, async (req: Request, res: Response) => {
    const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
    const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;

    try {
      const analysis = await opexService.getParetoAnalysis(wsId, projectId);
      res.json(analysis);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================================================
  // 7. BLOCK DE NOTAS COLABORATIVO (CON AUTOGUARDADO & WEBSOCKETS)
  // ==========================================================================
  router.get('/notes', authenticateNeonAuth, async (req: Request, res: Response) => {
    const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
    try {
      const notes = await notesService.getNotes(wsId);
      res.json(notes);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post(
    '/notes',
    authenticateNeonAuth,
    validateBody(CreateNoteSchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const authorId = req.user?.sub || null;

      try {
        const note = await notesService.createNote(wsId, authorId, req.body);
        res.status(201).json(note);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  router.put(
    '/notes/:noteId',
    authenticateNeonAuth,
    validateBody(UpdateNoteSchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const noteId = Array.isArray(req.params.noteId) ? req.params.noteId[0] : req.params.noteId;

      try {
        const updated = await notesService.updateNote(wsId, noteId, req.body);
        res.json(updated);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  router.delete('/notes/:noteId', authenticateNeonAuth, async (req: Request, res: Response) => {
    const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
    const noteId = Array.isArray(req.params.noteId) ? req.params.noteId[0] : req.params.noteId;

    try {
      const success = await notesService.deleteNote(wsId, noteId);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================================================
  // 8. GESTIÓN DMAIC & TOLLGATES (DEFINE -> BLUEPRINT DAG -> EJECUCIÓN)
  // ==========================================================================

  router.get('/projects/:id/dmaic', authenticateNeonAuth, async (req: Request, res: Response) => {
    const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
    const projectId = req.params.id as string;

    try {
      const phases = await dmaicService.getPhases(wsId, projectId);
      res.json(phases);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/projects/:id/dmaic/:phase', authenticateNeonAuth, async (req: Request, res: Response) => {
    const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
    const projectId = req.params.id as string;
    const rawPhase = Array.isArray(req.params.phase) ? req.params.phase[0] : req.params.phase;
    const phase = rawPhase.toUpperCase() as DmaicPhaseType;

    try {
      const phaseData = await dmaicService.getPhase(wsId, projectId, phase);
      if (!phaseData) {
        res.status(404).json({ error: `DMAIC phase '${phase}' not found.` });
        return;
      }
      res.json(phaseData);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put(
    '/projects/:id/dmaic/:phase',
    authenticateNeonAuth,
    validateBody(UpdateDmaicPhaseSchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const projectId = req.params.id as string;
      const rawPhase = Array.isArray(req.params.phase) ? req.params.phase[0] : req.params.phase;
      const phase = rawPhase.toUpperCase() as DmaicPhaseType;

      try {
        const updated = await dmaicService.updatePhase(wsId, projectId, phase, req.body);
        res.json(updated);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  router.post(
    '/projects/:id/dmaic/:phase/approve',
    authenticateNeonAuth,
    requireRole('ADMIN'),
    validateBody(ApproveTollgateSchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const projectId = req.params.id as string;
      const rawPhase = Array.isArray(req.params.phase) ? req.params.phase[0] : req.params.phase;
      const phase = rawPhase.toUpperCase() as DmaicPhaseType;
      const approvedBy = req.body.approved_by || req.user?.sub || null;

      try {
        const result = await dmaicService.approveTollgate(wsId, projectId, phase, approvedBy);
        res.json({
          success: true,
          message: `Tollgate for phase '${phase}' approved successfully.`,
          phase: result.phase,
          blueprint: result.blueprint
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // ==========================================================================
  // 9. BUCLE OPEX: ACCIÓN CORRECTIVA AUTOMÁTICA
  // ==========================================================================

  router.post(
    '/projects/:id/opex/corrective-action',
    authenticateNeonAuth,
    validateBody(CreateCorrectiveActionSchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const projectId = req.params.id as string;

      try {
        const correctiveTask = await opexService.createCorrectiveAction(wsId, projectId, req.body);
        res.status(201).json({
          success: true,
          message: 'Acción correctiva creada y conectada al DAG y cronograma de Gantt.',
          task: correctiveTask
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // ==========================================================================
  // 10. COMPILADOR AUTOMÁTICO DE ENTREGABLES TSOLUTIONS IPIDD (16:9)
  // ==========================================================================

  router.post(
    '/projects/:id/compile-deliverable',
    authenticateNeonAuth,
    validateBody(CompileDeliverableSchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
      const projectId = req.params.id as string;
      const authorId = req.body.author_id || req.user?.sub || null;

      try {
        const deliverable = await brandEnforcerService.compileProjectDeliverable(
          wsId,
          projectId,
          authorId
        );
        res.status(201).json({
          success: true,
          message: 'Entregable ejecutivo compilado exitosamente con tokens oficiales TSolutions IPIDD.',
          deliverable
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  return router;
}
