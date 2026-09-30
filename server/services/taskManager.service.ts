import { Pool, PoolClient } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { DagCacheService } from './dagCache.service';
import { CalendarService } from './calendar.service';
import { DEFAULT_WORKSPACE_ID, withWorkspaceClient } from '../middleware/workspace.middleware';

export class TaskManagerService {
  private dagCacheService: DagCacheService;
  private calendarService: CalendarService;

  constructor(
    private pool: Pool,
    private io: SocketIOServer,
    dagCacheService?: DagCacheService
  ) {
    this.dagCacheService = dagCacheService || new DagCacheService();
    this.calendarService = new CalendarService(pool);
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
      // Actualizar estado de la tarea
      const taskRes = await client.query(
        `UPDATE project_tasks
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND workspace_id = $3
         RETURNING *`,
        [newStatus, taskId, workspaceId]
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

      return { taskId, newStatus, nodeTransitions: transitions };
    });
  }

  public async getProjectTasks(projectId: string, workspaceId: string = DEFAULT_WORKSPACE_ID) {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const res = await client.query(
        `SELECT pt.*, u.name as assignee_name, u.email as assignee_email
         FROM project_tasks pt
         LEFT JOIN users u ON pt.assigned_to = u.id
         WHERE pt.project_id = $1 AND pt.workspace_id = $2
         ORDER BY pt.created_at ASC`,
        [projectId, workspaceId]
      );
      return res.rows;
    });
  }
}
