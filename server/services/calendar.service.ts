import { Pool, PoolClient } from 'pg';
import { withWorkspaceClient } from '../middleware/workspace.middleware';

export interface CalendarEvent {
  id: string;
  workspace_id: string;
  project_id?: string | null;
  title: string;
  description?: string | null;
  start_date: string | Date;
  due_date: string | Date;
  event_type: 'TASK' | 'GANTT_MILESTONE' | 'SPRINT' | 'CUSTOM';
  reference_id?: string | null;
  priority: string;
  status: string;
  alert_triggered: boolean;
  created_at?: string;
  updated_at?: string;
}

export class CalendarService {
  constructor(private pool: Pool) {}

  /**
   * Sincroniza automáticamente una tarea del gestor To-Do o Gantt con calendar_events
   */
  public async syncTaskEvent(
    clientOrPool: PoolClient | Pool,
    task: {
      id: string;
      workspace_id: string;
      project_id: string;
      title: string;
      description?: string | null;
      start_date?: string | Date | null;
      due_date?: string | Date | null;
      priority?: string;
      status?: string;
    }
  ): Promise<void> {
    if (!task.due_date) return; // Si no tiene fecha límite, no se mapea al calendario

    const startDate = task.start_date || task.due_date;
    const priority = task.priority || 'MEDIUM';
    const status = task.status || 'PENDING';

    await clientOrPool.query(
      `INSERT INTO calendar_events (
        workspace_id, project_id, title, description, start_date, due_date,
        event_type, reference_id, priority, status, alert_triggered, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'TASK', $7, $8, $9, false, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO NOTHING`,
      [
        task.workspace_id,
        task.project_id,
        task.title,
        task.description || null,
        startDate,
        task.due_date,
        task.id,
        priority,
        status
      ]
    );

    // Si ya existía un evento con reference_id = task.id, actualizarlo
    await clientOrPool.query(
      `UPDATE calendar_events
       SET title = $1, description = $2, start_date = $3, due_date = $4,
           priority = $5, status = $6, updated_at = CURRENT_TIMESTAMP
       WHERE reference_id = $7 AND event_type = 'TASK'`,
      [
        task.title,
        task.description || null,
        startDate,
        task.due_date,
        priority,
        status,
        task.id
      ]
    );
  }

  /**
   * Sincroniza un Sprint de Scrum con calendar_events
   */
  public async syncSprintEvent(
    clientOrPool: PoolClient | Pool,
    sprint: {
      id: string;
      workspace_id: string;
      project_id: string;
      name: string;
      start_date: string | Date;
      end_date: string | Date;
      status: string;
    }
  ): Promise<void> {
    await clientOrPool.query(
      `INSERT INTO calendar_events (
        workspace_id, project_id, title, description, start_date, due_date,
        event_type, reference_id, priority, status, alert_triggered, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'SPRINT', $7, 'HIGH', $8, false, CURRENT_TIMESTAMP)`,
      [
        sprint.workspace_id,
        sprint.project_id,
        `Sprint: ${sprint.name}`,
        `Hito de Sprint Scrum [${sprint.status}]`,
        sprint.start_date,
        sprint.end_date,
        sprint.id,
        sprint.status
      ]
    );
  }

  /**
   * Consulta eventos del calendario con filtro por workspace y opcionalmente por proyecto
   */
  public async getEvents(
    workspaceId: string,
    projectId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<CalendarEvent[]> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      let query = `
        SELECT ce.*, p.name as project_name
        FROM calendar_events ce
        LEFT JOIN projects p ON ce.project_id = p.id
        WHERE ce.workspace_id = $1
      `;
      const params: any[] = [workspaceId];
      let paramIdx = 2;

      if (projectId && projectId !== 'ALL') {
        query += ` AND ce.project_id = $${paramIdx++}`;
        params.push(projectId);
      }

      if (startDate) {
        query += ` AND ce.due_date >= $${paramIdx++}`;
        params.push(startDate);
      }

      if (endDate) {
        query += ` AND ce.due_date <= $${paramIdx++}`;
        params.push(endDate);
      }

      query += ` ORDER BY ce.due_date ASC`;

      const res = await client.query(query, params);
      return res.rows;
    });
  }

  /**
   * Consulta eventos próximos a vencer (dentro de 24h) o ya vencidos con alert_triggered = false
   */
  public async getPendingAlertEvents(): Promise<CalendarEvent[]> {
    const res = await this.pool.query(
      `SELECT ce.*, p.name as project_name
       FROM calendar_events ce
       LEFT JOIN projects p ON ce.project_id = p.id
       WHERE ce.alert_triggered = false
         AND ce.status != 'DONE'
         AND ce.status != 'COMPLETED'
         AND ce.due_date <= (CURRENT_TIMESTAMP + INTERVAL '24 hours')
       ORDER BY ce.due_date ASC
       LIMIT 50`
    );
    return res.rows;
  }

  /**
   * Marca alert_triggered = true tras despacho al Webhook Master
   */
  public async markAlertTriggered(eventId: string): Promise<void> {
    await this.pool.query(
      `UPDATE calendar_events
       SET alert_triggered = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [eventId]
    );
  }
}
