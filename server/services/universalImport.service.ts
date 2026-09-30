import { Pool, PoolClient } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { withWorkspaceClient, DEFAULT_WORKSPACE_ID } from '../middleware/workspace.middleware';
import { TaskCreateSchema } from '../validation/schemas';
import { CalendarService } from './calendar.service';

export type ImportSourceFormat = 'JSON' | 'CSV' | 'TRELLO' | 'MONDAY' | 'ASANA' | 'JIRA';

export interface ColumnMappingConfig {
  titleColumn: string;
  descriptionColumn?: string;
  priorityColumn?: string;
  statusColumn?: string;
  dueDateColumn?: string;
  assigneeColumn?: string;
}

export interface RawImportPayload {
  format: ImportSourceFormat;
  data: Array<Record<string, unknown>> | string;
  mapping?: Partial<ColumnMappingConfig>;
}

export interface PreflightImportResult {
  detectedFormat: ImportSourceFormat;
  totalRows: number;
  validRowsCount: number;
  invalidRowsCount: number;
  suggestedMapping: ColumnMappingConfig;
  preview: Array<{
    title: string;
    description?: string;
    priority: string;
    status: string;
    due_date?: string;
    valid: boolean;
    validationErrors?: string[];
  }>;
}

export interface ImportExecutionResult {
  importId: string;
  totalProcessed: number;
  importedCount: number;
  failedCount: number;
  taskIds: string[];
}

export class UniversalImportService {
  private calendarService: CalendarService;

  constructor(
    private pool: Pool,
    private io?: SocketIOServer
  ) {
    this.calendarService = new CalendarService(pool);
  }

  /**
   * Pre-flight validation: analiza la estructura, sugiere mapeo y evalúa las filas
   */
  public async preflightValidation(
    payload: RawImportPayload
  ): Promise<PreflightImportResult> {
    const rows = this.parseRawDataToRows(payload.format, payload.data);
    const suggestedMapping = this.detectColumnMapping(rows[0] || {}, payload.mapping);

    const preview: PreflightImportResult['preview'] = [];
    let validCount = 0;
    let invalidCount = 0;

    for (let i = 0; i < Math.min(rows.length, 100); i++) {
      const row = rows[i];
      const normalized = this.normalizeRow(row, suggestedMapping);

      const parsed = TaskCreateSchema.safeParse({
        title: normalized.title,
        description: normalized.description || undefined,
        priority: normalized.priority,
        status: normalized.status,
        due_date: normalized.due_date || undefined
      });

      if (parsed.success) {
        validCount++;
        preview.push({
          ...normalized,
          valid: true
        });
      } else {
        invalidCount++;
        preview.push({
          ...normalized,
          valid: false,
          validationErrors: parsed.error.issues.map(iss => `${iss.path.join('.')}: ${iss.message}`)
        });
      }
    }

    return {
      detectedFormat: payload.format,
      totalRows: rows.length,
      validRowsCount: validCount,
      invalidRowsCount: invalidCount,
      suggestedMapping,
      preview
    };
  }

  /**
   * Ejecución atómica de la importación masiva en PostgreSQL
   */
  public async executeImport(
    workspaceId: string = DEFAULT_WORKSPACE_ID,
    projectId: string,
    payload: RawImportPayload
  ): Promise<ImportExecutionResult> {
    const rows = this.parseRawDataToRows(payload.format, payload.data);
    const mapping = this.detectColumnMapping(rows[0] || {}, payload.mapping);

    return await withWorkspaceClient(this.pool, workspaceId, async (client: PoolClient) => {
      // 1. Crear registro de auditoría en project_imports_log
      const logRes = await client.query(
        `INSERT INTO project_imports_log (
           workspace_id, project_id, source_format, total_rows, imported_count, failed_count, mapping_config
         ) VALUES ($1, $2, $3, $4, 0, 0, $5)
         RETURNING id`,
        [workspaceId, projectId, payload.format, rows.length, JSON.stringify(mapping)]
      );
      const importId = logRes.rows[0].id;

      // 2. Localizar nodo del workflow para vincular tareas si existe
      const workflowRes = await client.query(
        `SELECT wn.id FROM workflow_nodes wn
         JOIN project_workflows pw ON wn.workflow_id = pw.id
         WHERE pw.project_id = $1
         ORDER BY wn.step_order ASC LIMIT 1`,
        [projectId]
      );
      const targetNodeId = workflowRes.rows[0]?.id || null;

      const createdTaskIds: string[] = [];
      const errors: Array<{ row: number; error: string }> = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const norm = this.normalizeRow(row, mapping);

        const validation = TaskCreateSchema.safeParse({
          title: norm.title,
          description: norm.description || undefined,
          priority: norm.priority,
          status: norm.status,
          due_date: norm.due_date || undefined
        });

        if (!validation.success) {
          errors.push({ row: i + 1, error: validation.error.issues.map(e => e.message).join('; ') });
          continue;
        }

        const taskRes = await client.query(
          `INSERT INTO project_tasks (
             workspace_id, project_id, title, description, priority, status, start_date, due_date
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            workspaceId,
            projectId,
            norm.title,
            norm.description || null,
            norm.priority,
            norm.status,
            new Date().toISOString(),
            norm.due_date || new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
          ]
        );

        const task = taskRes.rows[0];
        createdTaskIds.push(task.id);

        // Relacionar al nodo del DAG si existe
        if (targetNodeId) {
          await client.query(
            `INSERT INTO workflow_node_tasks (node_id, task_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [targetNodeId, task.id]
          );
        }

        // Sincronizar automáticamente con calendar_events
        await this.calendarService.syncTaskEvent(client, task);
      }

      // 3. Actualizar registro de auditoría final
      await client.query(
        `UPDATE project_imports_log
         SET imported_count = $1, failed_count = $2, errors = $3
         WHERE id = $4`,
        [createdTaskIds.length, errors.length, JSON.stringify(errors), importId]
      );

      // 4. Notificar vía WebSocket a la sala de workspace
      if (this.io) {
        this.io.to(`workspace_${workspaceId}`).emit('TASKS_IMPORTED', {
          projectId,
          importId,
          importedCount: createdTaskIds.length,
          failedCount: errors.length,
          timestamp: new Date().toISOString()
        });
      }

      return {
        importId,
        totalProcessed: rows.length,
        importedCount: createdTaskIds.length,
        failedCount: errors.length,
        taskIds: createdTaskIds
      };
    });
  }

  private parseRawDataToRows(
    format: ImportSourceFormat,
    data: Array<Record<string, unknown>> | string
  ): Array<Record<string, unknown>> {
    if (Array.isArray(data)) {
      return data;
    }

    if (typeof data === 'string') {
      const trimmed = data.trim();
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed;
          if (parsed && typeof parsed === 'object') {
            if (Array.isArray((parsed as Record<string, unknown>).cards)) return (parsed as Record<string, unknown>).cards as Array<Record<string, unknown>>;
            if (Array.isArray((parsed as Record<string, unknown>).tasks)) return (parsed as Record<string, unknown>).tasks as Array<Record<string, unknown>>;
            if (Array.isArray((parsed as Record<string, unknown>).items)) return (parsed as Record<string, unknown>).items as Array<Record<string, unknown>>;
            if (Array.isArray((parsed as Record<string, unknown>).issues)) return (parsed as Record<string, unknown>).issues as Array<Record<string, unknown>>;
            if (Array.isArray((parsed as Record<string, unknown>).data)) return (parsed as Record<string, unknown>).data as Array<Record<string, unknown>>;
          }
          return [parsed];
        } catch {
          // Si falla parseo JSON, continuar como CSV
        }
      }

      // Parser CSV nativo
      const lines = trimmed.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length < 2) return [];

      const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
      const parsedRows: Array<Record<string, unknown>> = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        const row: Record<string, unknown> = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] !== undefined ? values[idx] : '';
        });
        parsedRows.push(row);
      }
      return parsedRows;
    }

    return [];
  }

  private detectColumnMapping(
    sampleRow: Record<string, unknown>,
    userMapping?: Partial<ColumnMappingConfig>
  ): ColumnMappingConfig {
    const keys = Object.keys(sampleRow);
    const findKey = (candidates: string[]): string => {
      for (const cand of candidates) {
        const match = keys.find(k => k.toLowerCase().includes(cand.toLowerCase()));
        if (match) return match;
      }
      return '';
    };

    return {
      titleColumn: userMapping?.titleColumn || findKey(['title', 'name', 'task', 'summary', 'asunto', 'titulo']) || keys[0] || 'title',
      descriptionColumn: userMapping?.descriptionColumn || findKey(['description', 'desc', 'detalle', 'notes', 'notas']),
      priorityColumn: userMapping?.priorityColumn || findKey(['priority', 'prioridad', 'urgencia']),
      statusColumn: userMapping?.statusColumn || findKey(['status', 'estado', 'state', 'stage', 'closed']),
      dueDateColumn: userMapping?.dueDateColumn || findKey(['due_date', 'due', 'fecha_limite', 'deadline', 'vencimiento']),
      assigneeColumn: userMapping?.assigneeColumn || findKey(['assignee', 'responsable', 'assigned_to', 'owner'])
    };
  }

  private normalizeRow(
    row: Record<string, unknown>,
    mapping: ColumnMappingConfig
  ): { title: string; description?: string; priority: string; status: string; due_date?: string } {
    const rawTitle = String(row[mapping.titleColumn] || '').trim();
    const title = rawTitle.length >= 3 ? rawTitle : `Tarea Importada ${rawTitle}`.trim();

    const rawDesc = mapping.descriptionColumn ? String(row[mapping.descriptionColumn] || '').trim() : '';

    // Normalizar prioridad a LOW, MEDIUM, HIGH, CRITICAL
    const rawPriority = mapping.priorityColumn ? String(row[mapping.priorityColumn] || '').toUpperCase() : '';
    let priority = 'MEDIUM';
    if (rawPriority.includes('CRIT') || rawPriority.includes('URG')) priority = 'CRITICAL';
    else if (rawPriority.includes('HIGH') || rawPriority.includes('ALTA')) priority = 'HIGH';
    else if (rawPriority.includes('LOW') || rawPriority.includes('BAJA')) priority = 'LOW';

    // Normalizar status a TODO, IN_PROGRESS, REVIEW, DONE
    const rawVal = mapping.statusColumn ? row[mapping.statusColumn] : '';
    let status = 'TODO';
    if (typeof rawVal === 'boolean') {
      status = rawVal ? 'DONE' : 'TODO';
    } else {
      const rawStatus = String(rawVal || '').toUpperCase();
      if (rawStatus.includes('DONE') || rawStatus.includes('COMPL') || rawStatus.includes('TERMINADO') || rawStatus === 'TRUE') status = 'DONE';
      else if (rawStatus.includes('REV') || rawStatus.includes('TEST') || rawStatus.includes('QA')) status = 'REVIEW';
      else if (rawStatus.includes('PROG') || rawStatus.includes('DESARROLLO') || rawStatus.includes('DOING')) status = 'IN_PROGRESS';
    }

    // Normalizar fecha de entrega ISO
    let dueDate: string | undefined = undefined;
    if (mapping.dueDateColumn && row[mapping.dueDateColumn]) {
      const parsedDate = new Date(String(row[mapping.dueDateColumn]));
      if (!isNaN(parsedDate.getTime())) {
        dueDate = parsedDate.toISOString();
      }
    }

    return {
      title,
      description: rawDesc || undefined,
      priority,
      status,
      due_date: dueDate
    };
  }
}
