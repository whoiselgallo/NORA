import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { BlueprintEngineService } from '../services/blueprintEngine.service';
import { TaskManagerService } from '../services/taskManager.service';
import { GitHubWebhookHandler } from '../webhooks/github.handler';
import { MasterWebhookHandler } from '../webhooks/master.handler';
import { ChildDomainWebhooksHandler } from '../webhooks/childDomains.handler';
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
import { createAuthRouter } from './auth.routes';
import { authenticateNeonAuth, requireRole } from '../middleware/auth.middleware';
import { requireWorkspace, DEFAULT_WORKSPACE_ID, withWorkspaceClient } from '../middleware/workspace.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { createWebhookRateLimiter } from '../middleware/webhookSecurity.middleware';
import { WebhookQueueService } from '../services/webhookQueue.service';
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
  ChildWebhookPayloadSchema,
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
  const childWebhooksHandler = new ChildDomainWebhooksHandler(pool, io, masterWebhookHandler);
  const webhookQueueService = new WebhookQueueService(pool, io);
  const webhookRateLimiter = createWebhookRateLimiter({ windowMs: 60000, maxRequests: 120 });

  // Middleware global de aislamiento multi-tenant de Workspace
  router.use(requireWorkspace(pool));

  // ==========================================================================
  // WEBHOOKS (CON RATE LIMITING Y MONITOREO DE COLA ASÍNCRONA)
  // ==========================================================================
  router.use('/webhooks', webhookRateLimiter);

  // Catálogo de subdominios hijos y rutas de ingesta registradas
  router.get('/webhooks/subdomains', childWebhooksHandler.listChildSubdomains);

  // TS-WH-08 & TS-WH-10: Métricas en vivo de cola de despacho y Dead Letter Queue (DLQ)
  router.get('/webhooks/queue/stats', (_req, res) => {
    res.json(webhookQueueService.getStats());
  });

  // TS-WH-07 & TS-WH-10: Replay de evento fallido en Dead Letter Queue
  router.post('/webhooks/dlq/:dlqId/replay', (req, res) => {
    const job = webhookQueueService.replayDlqEntry(req.params.dlqId);
    if (!job) {
      res.status(404).json({ error: 'Registro DLQ no encontrado' });
      return;
    }
    res.json({ success: true, message: 'Evento reencolado desde la DLQ', job });
  });

  // Gateway unificado inteligente (enrutamiento por host / header / payload)
  router.post(
    '/webhooks/gateway',
    validateBody(ChildWebhookPayloadSchema),
    childWebhooksHandler.handleGatewayWebhook
  );

  // Webhook Master centralizado para telemetría CI/CD y alertas de calendario
  router.post(
    '/webhooks/master/:routingKey',
    validateBody(MasterWebhookPayloadSchema),
    masterWebhookHandler.handleMasterWebhook
  );

  // --------------------------------------------------------------------------
  // WEBHOOKS HIJOS DEDICADOS POR SUBDOMINIO
  // --------------------------------------------------------------------------
  // 1. vc.tsolutionsipidd.com (Videoconferencia, Salas Virtuales, WebRTC)
  router.post(
    '/webhooks/child/vc',
    validateBody(ChildWebhookPayloadSchema),
    childWebhooksHandler.handleVcWebhook
  );

  // 2. tsolutionsipidd.com (Dominio Principal Corporativo & Leads)
  router.post(
    '/webhooks/child/main',
    validateBody(ChildWebhookPayloadSchema),
    childWebhooksHandler.handleMainTsolutionsWebhook
  );

  // 3. admin.lacuevadelguero.com (Panel Administrativo & POS)
  router.post(
    '/webhooks/child/lacueva-admin',
    validateBody(ChildWebhookPayloadSchema),
    childWebhooksHandler.handleAdminLaCuevaWebhook
  );

  // 4. s.tsolutionsipidd.com (Storage, Assets, CDN & Microservicios)
  router.post(
    '/webhooks/child/s-tsolutions',
    validateBody(ChildWebhookPayloadSchema),
    childWebhooksHandler.handleStorageTsolutionsWebhook
  );

  // 5. m.tsolutionsipidd.com (Móvil, PWA y Mesa de Trabajo)
  router.post(
    '/webhooks/child/m-tsolutions',
    validateBody(ChildWebhookPayloadSchema),
    childWebhooksHandler.handleMobileTsolutionsWebhook
  );

  // 6. lacuevadelguero.com (Portal Comercial La Cueva del Güero)
  router.post(
    '/webhooks/child/lacueva',
    validateBody(ChildWebhookPayloadSchema),
    childWebhooksHandler.handleMainLaCuevaWebhook
  );

  // 7. s.lacuevadelguero.com (Sucursales, Delivery & Pasarelas de Pago)
  router.post(
    '/webhooks/child/lacueva-s',
    validateBody(ChildWebhookPayloadSchema),
    childWebhooksHandler.handleBranchesLaCuevaWebhook
  );

  // Verificación de estado, diagnóstico e inspección (GET / HEAD) para cualquier webhook hijo
  router.get('/webhooks/child/:childKey', childWebhooksHandler.handleChildWebhookHealth);

  // Webhook GitHub Telemetry
  router.post('/telemetry/github', webhookHandler.handleWebhook);

  // Subrutas de Marketing, AI Gateway & Nexus Architect Studio
  router.use('/marketing', createMarketingRouter(pool, io, campaignDispatcher));
  router.use('/ai', createAIRoutes(pool, io));
  router.use('/presentations', createPresentationRoutes(pool, io));
  router.use(createNexusStudioRouter(pool, io));
  router.use('/auth', createAuthRouter(pool, io));

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

  // 1.1 Listar miembros del workspace activo
  router.get('/workspaces/:workspaceId/members', async (req: Request, res: Response) => {
    const wsId = req.params.workspaceId || req.workspaceId || DEFAULT_WORKSPACE_ID;
    try {
      const result = await pool.query(
        `SELECT u.id, u.name, u.email, wm.role, u.company, wm.created_at
         FROM workspace_members wm
         JOIN users u ON u.id = wm.user_id
         WHERE wm.workspace_id = $1
         ORDER BY wm.created_at ASC`,
        [wsId]
      );
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 1.2 Enviar / registrar invitación a workspace
  router.post('/workspaces/:workspaceId/invitations', async (req: Request, res: Response) => {
    const wsId = req.params.workspaceId || req.workspaceId || DEFAULT_WORKSPACE_ID;
    const { email, name, role, department, invited_by } = req.body;
    try {
      const cleanEmail = (email || '').trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        res.status(400).json({ error: 'Correo electrónico inválido para la invitación' });
        return;
      }
      const userName = (name || cleanEmail.split('@')[0] || 'Colaborador Invitado').trim();
      const userRole = role || 'COLLABORATOR';

      let userRes = await pool.query(`SELECT id FROM users WHERE email = $1`, [cleanEmail]);
      let userId = userRes.rows[0]?.id;

      if (!userId) {
        const newU = await pool.query(
          `INSERT INTO users (name, email, role)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [userName, cleanEmail, userRole === 'CLIENT_SPONSOR' ? 'CLIENT' : 'COLLABORATOR']
        );
        userId = newU.rows[0].id;
      }

      await pool.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [wsId, userId, userRole === 'CLIENT_SPONSOR' ? 'CLIENT' : 'COLLABORATOR']
      );

      const token = Buffer.from(JSON.stringify({ wsId, email: cleanEmail, role: userRole, t: Date.now() })).toString('base64');
      const inviteUrl = `https://m.tsolutionsipidd.com/?invite=${token}&ws=${wsId}&role=${userRole}&name=${encodeURIComponent(userName)}`;

      res.status(201).json({
        success: true,
        message: 'Invitación generada exitosamente',
        invitation: {
          workspaceId: wsId,
          email: cleanEmail,
          name: userName,
          role: userRole,
          department: department || 'General',
          invitedBy: invited_by || 'Tech Leader / PM',
          inviteUrl
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 1.3 Actualizar rol de miembro en workspace
  router.post('/workspaces/:workspaceId/members/role', async (req: Request, res: Response) => {
    const wsId = req.params.workspaceId || req.workspaceId || DEFAULT_WORKSPACE_ID;
    const { user_id, email, new_role } = req.body;
    try {
      const targetRole = new_role === 'CLIENT_SPONSOR' ? 'CLIENT' : 'COLLABORATOR';
      if (user_id) {
        await pool.query(
          `UPDATE workspace_members SET role = $1 WHERE workspace_id = $2 AND user_id = $3`,
          [targetRole, wsId, user_id]
        );
      } else if (email) {
        await pool.query(
          `UPDATE workspace_members SET role = $1
           WHERE workspace_id = $2 AND user_id IN (SELECT id FROM users WHERE email = $3)`,
          [targetRole, wsId, email.trim().toLowerCase()]
        );
      }
      res.json({ success: true, message: `Rol actualizado a ${new_role}` });
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
    requireRole(['ADMIN', 'COLLABORATOR', 'CLIENT']),
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
  // TS-LOOP-01: THE NEXUS LOOP: FAST BOOTSTRAP HUD (<200ms First Meaningful Paint)
  router.get('/nexus/pulse-bootstrap', authenticateNeonAuth, async (req: Request, res: Response) => {
    const wsId = req.workspaceId || DEFAULT_WORKSPACE_ID;
    const projectId = (req.query.project_id as string) || '00000000-0000-0000-0000-000000000001';
    const startTime = Date.now();

    try {
      // 1. Obtener flujo DAG directamente de caché híbrido L1/L2 (<15ms)
      let workflow: any = null;
      try {
        const dagRes = await cache.getOrFetchDag(pool, projectId, wsId);
        workflow = dagRes.data;
      } catch {
        workflow = await cache.getDag(projectId, wsId);
      }

      // 2. Obtener resumen de tareas y límites WIP
      const tasks = await taskService.getProjectTasks(projectId, wsId).catch(() => []);
      const todoCount = tasks.filter((t: any) => t.status === 'TODO').length;
      const inProgressCount = tasks.filter((t: any) => t.status === 'IN_PROGRESS').length;
      const doneCount = tasks.filter((t: any) => t.status === 'DONE').length;
      const wipLimitReached = inProgressCount >= 5;

      // 3. Obtener métricas SLI/SLO y Dead Letter Queue
      const dlqStats = webhookQueueService.getStats();

      // 4. Calcular nivel Sigma estimado del proyecto
      const totalTasks = tasks.length || 1;
      const completionRatio = doneCount / totalTasks;
      const calculatedSigma = Math.min(6.0, Math.max(3.0, 3.5 + completionRatio * 2.5));

      const latency = Date.now() - startTime;

      res.json({
        workspaceId: wsId,
        projectId,
        bootstrapLatencyMs: latency,
        workflow: workflow || { nodes: [] },
        kanbanSummary: {
          total: tasks.length,
          todo: todoCount,
          inProgress: inProgressCount,
          done: doneCount,
          wipLimitReached,
          wipLimit: 5
        },
        health: {
          sigmaLevel: Number(calculatedSigma.toFixed(2)),
          sloStatus: dlqStats.dlq_entries_count > 0 ? 'WARNING_DLQ' : (wipLimitReached ? 'WARNING_WIP' : 'HEALTHY'),
          p95LatencyMs: Math.max(12, latency),
          dlqCount: dlqStats.dlq_entries_count,
          activeQueueJobs: dlqStats.active_jobs
        },
        serverTimestamp: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post(
    '/nexus/query',
    authenticateNeonAuth,
    validateBody(NexusQuerySchema),
    async (req: Request, res: Response) => {
      const wsId = req.workspaceId || (req.body && req.body.workspace_id) || (req.headers['x-workspace-id'] as string) || DEFAULT_WORKSPACE_ID;
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
