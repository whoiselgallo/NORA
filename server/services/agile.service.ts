import { Pool } from 'pg';
import { withWorkspaceClient } from '../middleware/workspace.middleware';
import { CalendarService } from './calendar.service';

export interface ScrumSprint {
  id: string;
  workspace_id: string;
  project_id: string;
  name: string;
  goal?: string | null;
  start_date: string;
  end_date: string;
  status: 'PLANNING' | 'ACTIVE' | 'COMPLETED';
}

export interface KanbanColumn {
  id: string;
  workspace_id: string;
  project_id: string;
  name: string;
  position: number;
  wip_limit: number;
  task_count?: number;
}

export interface GanttDependency {
  id: string;
  workspace_id: string;
  predecessor_id: string;
  successor_id: string;
  dependency_type: 'FS' | 'SS' | 'FF' | 'SF';
  lag_days: number;
}

export class AgileService {
  private calendarService: CalendarService;

  constructor(private pool: Pool) {
    this.calendarService = new CalendarService(pool);
  }

  // ==========================================================================
  // 1. SCRUM & BURNDOWN CALCULATION
  // ==========================================================================

  public async createSprint(
    workspaceId: string,
    projectId: string,
    data: { name: string; goal?: string; start_date: string; end_date: string }
  ): Promise<ScrumSprint> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const res = await client.query(
        `INSERT INTO scrum_sprints (workspace_id, project_id, name, goal, start_date, end_date, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'PLANNING')
         RETURNING *`,
        [workspaceId, projectId, data.name, data.goal || null, data.start_date, data.end_date]
      );

      const sprint = res.rows[0];

      // Sincronizar automáticamente hito con calendar_events
      await this.calendarService.syncSprintEvent(client, sprint);

      return sprint;
    });
  }

  public async getSprints(workspaceId: string, projectId: string): Promise<ScrumSprint[]> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const res = await client.query(
        `SELECT s.*, 
                COALESCE(SUM(pt.story_points), 0)::int as total_story_points,
                COALESCE(SUM(CASE WHEN pt.status = 'DONE' THEN pt.story_points ELSE 0 END), 0)::int as completed_story_points
         FROM scrum_sprints s
         LEFT JOIN project_tasks pt ON pt.sprint_id = s.id
         WHERE s.workspace_id = $1 AND s.project_id = $2
         GROUP BY s.id
         ORDER BY s.start_date ASC`,
        [workspaceId, projectId]
      );
      return res.rows;
    });
  }

  public async getSprintBurndown(
    workspaceId: string,
    projectId: string,
    sprintId: string
  ): Promise<{
    sprint: ScrumSprint;
    totalStoryPoints: number;
    completedStoryPoints: number;
    remainingStoryPoints: number;
    velocity: number;
    tasks: any[];
  }> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const sprintRes = await client.query(
        `SELECT * FROM scrum_sprints WHERE id = $1 AND workspace_id = $2 AND project_id = $3`,
        [sprintId, workspaceId, projectId]
      );

      if (sprintRes.rows.length === 0) {
        throw new Error('Sprint not found in specified workspace and project');
      }

      const sprint = sprintRes.rows[0];

      const tasksRes = await client.query(
        `SELECT id, title, status, priority, story_points, updated_at
         FROM project_tasks
         WHERE sprint_id = $1 AND workspace_id = $2
         ORDER BY created_at ASC`,
        [sprintId, workspaceId]
      );

      const tasks = tasksRes.rows;
      let totalPoints = 0;
      let completedPoints = 0;

      for (const t of tasks) {
        const pts = Number(t.story_points) || 0;
        totalPoints += pts;
        if (t.status === 'DONE') {
          completedPoints += pts;
        }
      }

      const remainingPoints = totalPoints - completedPoints;
      const velocity = totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0;

      return {
        sprint,
        totalStoryPoints: totalPoints,
        completedStoryPoints: completedPoints,
        remainingStoryPoints: remainingPoints,
        velocity,
        tasks
      };
    });
  }

  // ==========================================================================
  // 2. KANBAN WITH WIP LIMIT VALIDATION
  // ==========================================================================

  public async getKanbanColumns(workspaceId: string, projectId: string): Promise<KanbanColumn[]> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      // Si no existen columnas para el proyecto, inicializar las columnas predeterminadas
      const checkRes = await client.query(
        `SELECT * FROM kanban_columns WHERE workspace_id = $1 AND project_id = $2 ORDER BY position ASC`,
        [workspaceId, projectId]
      );

      if (checkRes.rows.length === 0) {
        const defaultCols = [
          { name: 'Backlog / To-Do', pos: 0, wip: 15 },
          { name: 'En Desarrollo', pos: 1, wip: 5 },
          { name: 'En Revisión (QA)', pos: 2, wip: 3 },
          { name: 'Terminado (Done)', pos: 3, wip: 50 }
        ];

        for (const col of defaultCols) {
          await client.query(
            `INSERT INTO kanban_columns (workspace_id, project_id, name, position, wip_limit)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT DO NOTHING`,
            [workspaceId, projectId, col.name, col.pos, col.wip]
          );
        }

        const freshRes = await client.query(
          `SELECT kc.*, 
                  COUNT(pt.id)::int as task_count
           FROM kanban_columns kc
           LEFT JOIN project_tasks pt ON pt.kanban_column_id = kc.id
           WHERE kc.workspace_id = $1 AND kc.project_id = $2
           GROUP BY kc.id
           ORDER BY kc.position ASC`,
          [workspaceId, projectId]
        );
        return freshRes.rows;
      }

      const res = await client.query(
        `SELECT kc.*, 
                COUNT(pt.id)::int as task_count
         FROM kanban_columns kc
         LEFT JOIN project_tasks pt ON pt.kanban_column_id = kc.id
         WHERE kc.workspace_id = $1 AND kc.project_id = $2
         GROUP BY kc.id
         ORDER BY kc.position ASC`,
        [workspaceId, projectId]
      );
      return res.rows;
    });
  }

  public async moveKanbanCard(
    workspaceId: string,
    taskId: string,
    targetColumnId: string,
    newPosition: number = 0
  ): Promise<{ success: boolean; task: any; column: any }> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      // 1. Validar columna destino y su WIP Limit
      const colRes = await client.query(
        `SELECT kc.*, COUNT(pt.id)::int as current_wip
         FROM kanban_columns kc
         LEFT JOIN project_tasks pt ON pt.kanban_column_id = kc.id AND pt.id != $1
         WHERE kc.id = $2 AND kc.workspace_id = $3
         GROUP BY kc.id`,
        [taskId, targetColumnId, workspaceId]
      );

      if (colRes.rows.length === 0) {
        throw new Error('Target Kanban column not found in this workspace');
      }

      const targetCol = colRes.rows[0];
      const currentWip = targetCol.current_wip;

      // Validación estricta de WIP limit
      if (currentWip >= targetCol.wip_limit) {
        throw new Error(
          `WIP_LIMIT_EXCEEDED: Column '${targetCol.name}' has reached its maximum capacity of ${targetCol.wip_limit} tasks.`
        );
      }

      // 2. Mapear estado general según columna
      let taskStatus = 'IN_PROGRESS';
      const colLower = targetCol.name.toLowerCase();
      if (colLower.includes('backlog') || colLower.includes('to-do')) {
        taskStatus = 'TODO';
      } else if (colLower.includes('revis') || colLower.includes('review') || colLower.includes('qa')) {
        taskStatus = 'REVIEW';
      } else if (colLower.includes('done') || colLower.includes('termin')) {
        taskStatus = 'DONE';
      }

      // 3. Actualizar la tarea
      const updateTaskRes = await client.query(
        `UPDATE project_tasks
         SET kanban_column_id = $1,
             kanban_position = $2,
             status = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4 AND workspace_id = $5
         RETURNING *`,
        [targetColumnId, newPosition, taskStatus, taskId, workspaceId]
      );

      if (updateTaskRes.rows.length === 0) {
        throw new Error('Task not found in this workspace');
      }

      const updatedTask = updateTaskRes.rows[0];

      // Sincronizar con calendario
      await this.calendarService.syncTaskEvent(client, updatedTask);

      return {
        success: true,
        task: updatedTask,
        column: targetCol
      };
    });
  }

  // ==========================================================================
  // 3. GANTT DEPENDENCIES & CRITICAL PATH METHOD (CPM)
  // ==========================================================================

  public async createGanttDependency(
    workspaceId: string,
    predecessorId: string,
    successorId: string,
    dependencyType: 'FS' | 'SS' | 'FF' | 'SF' = 'FS',
    lagDays: number = 0
  ): Promise<GanttDependency> {
    if (predecessorId === successorId) {
      throw new Error('A task cannot depend on itself.');
    }

    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const res = await client.query(
        `INSERT INTO gantt_dependencies (workspace_id, predecessor_id, successor_id, dependency_type, lag_days)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (predecessor_id, successor_id) 
         DO UPDATE SET dependency_type = EXCLUDED.dependency_type, lag_days = EXCLUDED.lag_days
         RETURNING *`,
        [workspaceId, predecessorId, successorId, dependencyType, lagDays]
      );
      return res.rows[0];
    });
  }

  public async getGanttData(workspaceId: string, projectId: string) {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const tasksRes = await client.query(
        `SELECT id, title, status, priority, start_date, due_date, created_at
         FROM project_tasks
         WHERE project_id = $1 AND workspace_id = $2
         ORDER BY start_date ASC NULLS LAST, created_at ASC`,
        [projectId, workspaceId]
      );

      const depsRes = await client.query(
        `SELECT gd.*
         FROM gantt_dependencies gd
         JOIN project_tasks pt ON gd.predecessor_id = pt.id
         WHERE pt.project_id = $1 AND gd.workspace_id = $2`,
        [projectId, workspaceId]
      );

      return {
        tasks: tasksRes.rows,
        dependencies: depsRes.rows
      };
    });
  }

  /**
   * Cálculo de Ruta Crítica (Critical Path Method - CPM)
   * Determina la secuencia de tareas dependientes con holgura cero (zero slack)
   */
  public async calculateCriticalPath(workspaceId: string, projectId: string): Promise<{
    criticalPathTaskIds: string[];
    totalProjectDurationDays: number;
  }> {
    const data = await this.getGanttData(workspaceId, projectId);
    const tasks = data.tasks;
    const deps = data.dependencies;

    if (tasks.length === 0) {
      return { criticalPathTaskIds: [], totalProjectDurationDays: 0 };
    }

    // Mapa de duración en días por tarea
    const durations = new Map<string, number>();
    for (const t of tasks) {
      const start = t.start_date ? new Date(t.start_date).getTime() : new Date(t.created_at).getTime();
      const end = t.due_date ? new Date(t.due_date).getTime() : start + 86400000;
      const days = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
      durations.set(t.id, days);
    }

    // Grafo de adyacencia
    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    for (const t of tasks) {
      adj.set(t.id, []);
      inDegree.set(t.id, 0);
    }

    for (const d of deps) {
      if (adj.has(d.predecessor_id)) {
        adj.get(d.predecessor_id)!.push(d.successor_id);
        inDegree.set(d.successor_id, (inDegree.get(d.successor_id) || 0) + 1);
      }
    }

    // Forward pass: calcular Early Finish (EF)
    const earlyStart = new Map<string, number>();
    const earlyFinish = new Map<string, number>();
    const queue: string[] = [];

    for (const t of tasks) {
      if ((inDegree.get(t.id) || 0) === 0) {
        earlyStart.set(t.id, 0);
        earlyFinish.set(t.id, durations.get(t.id) || 1);
        queue.push(t.id);
      }
    }

    while (queue.length > 0) {
      const u = queue.shift()!;
      const uEf = earlyFinish.get(u) || 0;

      for (const v of adj.get(u) || []) {
        const currentVs = earlyStart.get(v) || 0;
        if (uEf > currentVs) {
          earlyStart.set(v, uEf);
          earlyFinish.set(v, uEf + (durations.get(v) || 1));
        }

        const deg = (inDegree.get(v) || 1) - 1;
        inDegree.set(v, deg);
        if (deg === 0) {
          queue.push(v);
        }
      }
    }

    let maxDuration = 0;
    for (const ef of earlyFinish.values()) {
      if (ef > maxDuration) maxDuration = ef;
    }

    // Tareas con earlyFinish más cercano a la duración máxima forman la ruta crítica
    const criticalTaskIds: string[] = [];
    for (const [id, ef] of earlyFinish.entries()) {
      if (ef >= maxDuration - 1) {
        criticalTaskIds.push(id);
      }
    }

    return {
      criticalPathTaskIds: criticalTaskIds,
      totalProjectDurationDays: maxDuration
    };
  }

  /**
   * Desplazamiento en cascada de fechas al mover una barra en el Gantt
   */
  public async rescheduleGanttTask(
    workspaceId: string,
    taskId: string,
    newStartDate: string,
    newDueDate: string
  ): Promise<{ updatedTasksCount: number }> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      // 1. Actualizar fecha de la tarea origen
      const updateRes = await client.query(
        `UPDATE project_tasks
         SET start_date = $1, due_date = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND workspace_id = $4
         RETURNING *`,
        [newStartDate, newDueDate, taskId, workspaceId]
      );

      if (updateRes.rows.length === 0) {
        throw new Error('Task not found');
      }

      const rootTask = updateRes.rows[0];
      await this.calendarService.syncTaskEvent(client, rootTask);

      // 2. Calcular delta en días
      const diffMs = new Date(newDueDate).getTime() - new Date(rootTask.due_date || newDueDate).getTime();

      // 3. Desplazar sucesores directos e indirectos en cascada
      const succRes = await client.query(
        `WITH RECURSIVE task_tree AS (
          SELECT successor_id, lag_days
          FROM gantt_dependencies
          WHERE predecessor_id = $1 AND workspace_id = $2
          UNION
          SELECT gd.successor_id, gd.lag_days
          FROM gantt_dependencies gd
          INNER JOIN task_tree tt ON gd.predecessor_id = tt.successor_id
          WHERE gd.workspace_id = $2
        )
        SELECT DISTINCT successor_id FROM task_tree`,
        [taskId, workspaceId]
      );

      let cascadedCount = 1;
      const parentDueDate = new Date(newDueDate);

      for (const row of succRes.rows) {
        const succId = row.successor_id;
        const sRes = await client.query(
          `SELECT id, start_date, due_date FROM project_tasks WHERE id = $1 AND workspace_id = $2`,
          [succId, workspaceId]
        );

        if (sRes.rows.length > 0) {
          const s = sRes.rows[0];
          const origStart = s.start_date ? new Date(s.start_date) : parentDueDate;
          const origDue = s.due_date ? new Date(s.due_date) : new Date(parentDueDate.getTime() + 86400000);
          const durationMs = Math.max(86400000, origDue.getTime() - origStart.getTime());

          const nextStart = new Date(parentDueDate.getTime() + 86400000);
          const nextDue = new Date(nextStart.getTime() + durationMs);

          const upSucc = await client.query(
            `UPDATE project_tasks
             SET start_date = $1, due_date = $2, updated_at = CURRENT_TIMESTAMP
             WHERE id = $3 AND workspace_id = $4
             RETURNING *`,
            [nextStart.toISOString(), nextDue.toISOString(), succId, workspaceId]
          );

          if (upSucc.rows.length > 0) {
            await this.calendarService.syncTaskEvent(client, upSucc.rows[0]);
            cascadedCount++;
          }
        }
      }

      return { updatedTasksCount: cascadedCount };
    });
  }
}
