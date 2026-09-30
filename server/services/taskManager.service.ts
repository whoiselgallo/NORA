import { Pool, PoolClient } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { DagCacheService } from './dagCache.service';

export class TaskManagerService {
  private dagCacheService: DagCacheService;

  constructor(
    private pool: Pool,
    private io: SocketIOServer,
    dagCacheService?: DagCacheService
  ) {
    this.dagCacheService = dagCacheService || new DagCacheService();
  }

  public async updateTaskStatus(
    taskId: string,
    newStatus: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE',
    requestingUserRole: 'ADMIN' | 'COLLABORATOR' | 'CLIENT'
  ): Promise<{ taskId: string; newStatus: string; nodeTransitions: Array<{ nodeId: string; status: 'RED' | 'GREEN' }> }> {
    // 1. Regla de autorización estricta: CLIENT no puede mutar tareas de desarrollo
    if (requestingUserRole === 'CLIENT') {
      throw new Error('FORBIDDEN: CLIENT role cannot mutate development tasks.');
    }

    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Actualizar estado de la tarea
      const taskRes = await client.query(
        `UPDATE project_tasks
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING project_id`,
        [newStatus, taskId]
      );

      if (taskRes.rows.length === 0) {
        throw new Error('Task not found.');
      }
      const projectId = taskRes.rows[0].project_id;

      // 2. Identificar nodos vinculados en workflow_node_tasks
      const nodesRes = await client.query(
        `SELECT DISTINCT node_id FROM workflow_node_tasks WHERE task_id = $1`,
        [taskId]
      );

      const transitions: Array<{ nodeId: string; status: 'RED' | 'GREEN' }> = [];

      // 3. Algoritmo de Transición Binaria
      for (const row of nodesRes.rows) {
        const nodeId = row.node_id;

        // Consultar todas las tareas asociadas al nodo
        const checkRes = await client.query(
          `SELECT pt.status
           FROM workflow_node_tasks wnt
           JOIN project_tasks pt ON wnt.task_id = pt.id
           WHERE wnt.node_id = $1`,
          [nodeId]
        );

        const allTasks = checkRes.rows;
        // Si todas las tareas asociadas están en DONE => GREEN; si al menos una no está en DONE => RED
        const allDone = allTasks.length > 0 && allTasks.every(t => t.status === 'DONE');
        const targetStatus: 'RED' | 'GREEN' = allDone ? 'GREEN' : 'RED';

        // Actualizar nodo si hubo transición
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

      await client.query('COMMIT');

      // 4. Invalidación atómica de Redis inmediatamente ANTES de emitir por WebSockets
      if (transitions.length > 0) {
        await this.dagCacheService.invalidateDag(projectId);
      }

      // 5. Emisión WebSocket a la sala del proyecto (< 200 ms)
      this.io.to(`project:${projectId}`).emit('TASK_STATUS_UPDATED', {
        taskId,
        status: newStatus
      });

      for (const trans of transitions) {
        this.io.to(`project:${projectId}`).emit('WORKFLOW_NODE_TRANSITION', {
          nodeId: trans.nodeId,
          status: trans.status,
          reason: 'TASK_COMPLETION_STATE_CHANGED'
        });
      }

      return { taskId, newStatus, nodeTransitions: transitions };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async getProjectTasks(projectId: string) {
    const res = await this.pool.query(
      `SELECT pt.*, u.name as assignee_name, u.email as assignee_email
       FROM project_tasks pt
       LEFT JOIN users u ON pt.assigned_to = u.id
       WHERE pt.project_id = $1
       ORDER BY pt.created_at ASC`,
      [projectId]
    );
    return res.rows;
  }
}
