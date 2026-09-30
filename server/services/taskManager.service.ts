import { Pool, PoolClient } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { DagCacheService } from './dagCache.service';
import { CalendarService } from './calendar.service';
import { OrchestratorService } from './orchestrator.service';
import { DEFAULT_WORKSPACE_ID, withWorkspaceClient } from '../middleware/workspace.middleware';

export class TaskManagerService {
  private dagCacheService: DagCacheService;
  private calendarService: CalendarService;
  private orchestrator?: OrchestratorService;

  constructor(
    private pool: Pool,
    private io: SocketIOServer,
    dagCacheService?: DagCacheService,
    orchestrator?: OrchestratorService
  ) {
    this.dagCacheService = dagCacheService || new DagCacheService();
    this.calendarService = new CalendarService(pool);
    this.orchestrator = orchestrator;
  }

  public async updateTaskStatus(
    taskId: string,
    newStatus: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE',
    requestingUserRole: 'ADMIN' | 'COLLABORATOR' | 'CLIENT',
    workspaceId: string = DEFAULT_WORKSPACE_ID
  ): Promise<{ taskId: string; newStatus: string; nodeTransitions: Array<{ nodeId: string; status: 'RED' | 'GREEN' }> }> {
    // 1. Regla de autorización estricta: CLIENT no puede mutar tareas de desarrollo
    if (requestingUserRole === 'CLIENT') {
      throw new Error('FORBIDDEN: CLIENT role cannot mutate development tasks.');
    }

    return await withWorkspaceClient(this.pool, workspaceId, async (client: PoolClient) => {
      // 1.2 Bloqueo inmutable si el proyecto está ARCHIVADO
      const projCheck = await client.query(
        `SELECT p.status FROM projects p JOIN project_tasks pt ON pt.project_id = p.id WHERE pt.id = $1`,
        [taskId]
      );
      if (projCheck.rows[0]?.status === 'ARCHIVED') {
        throw new Error('PROJECT_IS_ARCHIVED_READ_ONLY: El proyecto se encuentra archivado. Las tareas están en modo solo lectura inmutable.');
      }

      // 1.5 Mapeo a columna Kanban homónima y validación estricta de WIP limits
      const statusToColPos: Record<string, number> = {
        TODO: 0,
        IN_PROGRESS: 1,
        REVIEW: 2,
        DONE: 3
      };
      const targetPos = statusToColPos[newStatus];
      let targetColId: string | null = null;

      if (targetPos !== undefined) {
        const colRes = await client.query(
          `SELECT id, name, wip_limit FROM kanban_columns 
           WHERE project_id = (SELECT project_id FROM project_tasks WHERE id = $1)
             AND workspace_id = $2 AND position = $3`,
          [taskId, workspaceId, targetPos]
        );

        if (colRes.rows.length > 0) {
          const col = colRes.rows[0];
          targetColId = col.id;

          // Si la columna tiene wip_limit y no es la columna final (DONE), validar capacidad
          if (col.wip_limit && targetPos !== 3) {
            const countRes = await client.query(
              `SELECT COUNT(*)::int as count FROM project_tasks 
               WHERE kanban_column_id = $1 AND workspace_id = $2 AND id != $3`,
              [col.id, workspaceId, taskId]
            );
            if (countRes.rows[0].count >= col.wip_limit) {
              throw new Error(`WIP_LIMIT_EXCEEDED: Column '${col.name}' reached its maximum WIP limit of ${col.wip_limit}.`);
            }
          }
        }
      }

      // Actualizar estado de la tarea y proyectar a kanban_column_id
      const taskRes = await client.query(
        `UPDATE project_tasks
         SET status = $1,
             kanban_column_id = COALESCE($4, kanban_column_id),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND workspace_id = $3
         RETURNING *`,
        [newStatus, taskId, workspaceId, targetColId]
      );

      if (taskRes.rows.length === 0) {
        throw new Error('Task not found in this workspace.');
      }
      const task = taskRes.rows[0];
      const projectId = task.project_id;

      // Sincronizar automáticamente con calendar_events
      await this.calendarService.syncTaskEvent(client, task);

      // 2. Identificar nodos vinculados en workflow_node_tasks
      const nodesRes = await client.query(
        `SELECT DISTINCT node_id FROM workflow_node_tasks WHERE task_id = $1`,
        [taskId]
      );

      const transitions: Array<{ nodeId: string; status: 'RED' | 'GREEN' }> = [];

      // 3. Algoritmo de Transición Binaria
      for (const row of nodesRes.rows) {
        const nodeId = row.node_id;

        const checkRes = await client.query(
          `SELECT pt.status
           FROM workflow_node_tasks wnt
           JOIN project_tasks pt ON wnt.task_id = pt.id
           WHERE wnt.node_id = $1`,
          [nodeId]
        );

        const allTasks = checkRes.rows;
        const allDone = allTasks.length > 0 && allTasks.every(t => t.status === 'DONE');
        const targetStatus: 'RED' | 'GREEN' = allDone ? 'GREEN' : 'RED';

        const updateNodeRes = await client.query(
          `UPDATE workflow_nodes
           SET status = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND status != $1
           RETURNING id, slug, status`,
          [targetStatus, nodeId]
        );

        if (updateNodeRes.rows.length > 0) {
          transitions.push({ nodeId, status: targetStatus });
        }
      }

      // 4. Invalidación atómica de Redis inmediatamente ANTES de emitir por WebSockets
      if (transitions.length > 0) {
        await this.dagCacheService.invalidateDag(projectId, workspaceId);

        // Si algún nodo pasó a GREEN, verificar si TODO el grafo alcanzó DEPLOY GREEN
        const anyGreen = transitions.some(t => t.status === 'GREEN');
        if (anyGreen) {
          const allNodesRes = await client.query(
            `SELECT status FROM workflow_nodes 
             WHERE workflow_id IN (SELECT id FROM project_workflows WHERE project_id = $1)`,
            [projectId]
          );
          const allGreen = allNodesRes.rows.length > 0 && allNodesRes.rows.every(n => n.status === 'GREEN');
          if (allGreen) {
            // Desbloquear y activar campañas de mercadotecnia
            await client.query(
              `UPDATE marketing_campaigns
               SET status = 'PROCESSING', is_blocked = false
               WHERE project_id = $1 AND (status = 'DRAFT' OR is_blocked = true)`,
              [projectId]
            );

            if (this.orchestrator) {
              await this.orchestrator.emitEvent({
                event_type: 'DEPLOY_GREEN_REACHED',
                workspace_id: workspaceId,
                project_id: projectId,
                payload: {
                  status: 'GREEN',
                  totalNodes: allNodesRes.rows.length,
                  timestamp: new Date().toISOString()
                },
                timestamp: new Date().toISOString()
              });
            }
          }
        }
      }

      // 5. Emisión WebSocket a las salas de workspace y proyecto
      this.io.to(`workspace_${workspaceId}`).emit('TASK_STATUS_UPDATED', {
        taskId,
        status: newStatus,
        workspaceId,
        projectId
      });
      this.io.to(`project:${projectId}`).emit('TASK_STATUS_UPDATED', {
        taskId,
        status: newStatus
      });

      for (const trans of transitions) {
        this.io.to(`workspace_${workspaceId}`).emit('WORKFLOW_NODE_TRANSITION', {
          nodeId: trans.nodeId,
          status: trans.status,
          reason: 'TASK_COMPLETION_STATE_CHANGED',
          workspaceId,
          projectId
        });
        this.io.to(`project:${projectId}`).emit('WORKFLOW_NODE_TRANSITION', {
          nodeId: trans.nodeId,
          status: trans.status,
          reason: 'TASK_COMPLETION_STATE_CHANGED'
        });
      }

      // 6. Notificar al bus central de eventos
      if (this.orchestrator) {
        await this.orchestrator.emitEvent({
          event_type: 'TASK_MUTATED',
          workspace_id: workspaceId,
          project_id: projectId,
          entity_id: taskId,
          payload: {
            taskId,
            newStatus,
            nodeTransitions: transitions
          },
          timestamp: new Date().toISOString()
        });
      }

      return { taskId, newStatus, nodeTransitions: transitions };
    });
  }

  public async getProjectTasks(projectId: string, workspaceId: string = DEFAULT_WORKSPACE_ID) {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const res = await client.query(
        `SELECT pt.*, u.name as assignee_name, u.email as assignee_email,
                kc.name as kanban_column_name, kc.position as kanban_column_position
         FROM project_tasks pt
         LEFT JOIN users u ON pt.assigned_to = u.id
         LEFT JOIN kanban_columns kc ON pt.kanban_column_id = kc.id
         WHERE pt.project_id = $1 AND pt.workspace_id = $2
         ORDER BY pt.created_at ASC`,
        [projectId, workspaceId]
      );
      return res.rows;
    });
  }
}
