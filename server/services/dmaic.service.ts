import { Pool } from 'pg';
import { withWorkspaceClient, DEFAULT_WORKSPACE_ID } from '../middleware/workspace.middleware';
import { BlueprintEngineService } from './blueprintEngine.service';
import { AgileService } from './agile.service';
import { OrchestratorService } from './orchestrator.service';

export type DmaicPhaseType = 'DEFINE' | 'MEASURE' | 'ANALYZE' | 'IMPROVE' | 'CONTROL';
export type TollgateStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface SipocData {
  suppliers: string[];
  inputs: string[];
  process: string[];
  outputs: string[];
  customers: string[];
}

export interface MeasureBaselineMetrics {
  defect_rate: number;
  cycle_time_hours: number;
  dpmo: number;
  sigma_level: number;
}

export interface ControlPlan {
  tolerance_min_duration_ms: number;
  tolerance_max_duration_ms: number;
  min_success_rate: number;
  telemetry_logs: Array<{
    duration_ms: number;
    conclusion: string;
    commit_sha: string;
    branch: string;
    timestamp: string;
    within_tolerance: boolean;
  }>;
}

export interface DmaicPhaseRecord {
  id: string;
  workspace_id: string;
  project_id: string;
  phase: DmaicPhaseType;
  tollgate_status: TollgateStatus;
  approved_at: string | null;
  approved_by: string | null;
  charter_problem_statement: string | null;
  charter_business_case: string | null;
  charter_goal: string | null;
  charter_scope: string | null;
  sipoc_data: SipocData;
  measure_baseline_metrics: MeasureBaselineMetrics;
  analyze_findings: Record<string, unknown>;
  improve_action_plan: Record<string, unknown>;
  control_plan: ControlPlan;
  created_at: string;
  updated_at: string;
}

export class DmaicService {
  private agileService: AgileService;

  constructor(
    private pool: Pool,
    private orchestrator?: OrchestratorService
  ) {
    this.agileService = new AgileService(pool);
  }

  /**
   * Inicializa las 5 fases DMAIC para un proyecto
   */
  public async initializeProjectDmaic(
    workspaceId: string = DEFAULT_WORKSPACE_ID,
    projectId: string,
    initialCharter?: {
      problemStatement?: string;
      businessCase?: string;
      goal?: string;
      scope?: string;
    }
  ): Promise<DmaicPhaseRecord[]> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const phases: DmaicPhaseType[] = ['DEFINE', 'MEASURE', 'ANALYZE', 'IMPROVE', 'CONTROL'];
      const defaultSipoc: SipocData = {
        suppliers: ['Arquitectura', 'DevOps', 'Negocio'],
        inputs: ['Requisitos SRS', 'Stack Tecnológico', 'Políticas RLS'],
        process: ['Génesis DAG', 'Construcción Core', 'QA & Pruebas', 'Despliegue CI/CD'],
        outputs: ['Software Operativo', 'Telemetría', 'Entregables'],
        customers: ['Stakeholders', 'Clientes Finales']
      };

      const defaultMetrics: MeasureBaselineMetrics = {
        defect_rate: 4.5,
        cycle_time_hours: 48,
        dpmo: 3400,
        sigma_level: 4.2
      };

      const defaultControlPlan: ControlPlan = {
        tolerance_min_duration_ms: 0,
        tolerance_max_duration_ms: 180000, // 3 minutos
        min_success_rate: 95.0,
        telemetry_logs: []
      };

      for (const p of phases) {
        await client.query(
          `INSERT INTO dmaic_phases (
             workspace_id, project_id, phase, tollgate_status,
             charter_problem_statement, charter_business_case, charter_goal, charter_scope,
             sipoc_data, measure_baseline_metrics, control_plan
           ) VALUES ($1, $2, $3, 'PENDING', $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (project_id, phase) DO UPDATE
           SET charter_problem_statement = COALESCE(EXCLUDED.charter_problem_statement, dmaic_phases.charter_problem_statement),
               charter_scope = COALESCE(EXCLUDED.charter_scope, dmaic_phases.charter_scope)`,
          [
            workspaceId,
            projectId,
            p,
            initialCharter?.problemStatement || 'Optimizar flujo de entrega de software y calidad operativa.',
            initialCharter?.businessCase || 'Asegurar tolerancia cero a defectos y entrega automatizada con CI/CD.',
            initialCharter?.goal || 'Alcanzar estabilidad técnica y despliegue automatizado con trazabilidad completa.',
            initialCharter?.scope || 'Módulos Core, Telemetría, Seguridad RLS y Pipeline CI/CD.',
            JSON.stringify(defaultSipoc),
            JSON.stringify(defaultMetrics),
            JSON.stringify(defaultControlPlan)
          ]
        );
      }

      const res = await client.query(
        `SELECT * FROM dmaic_phases WHERE project_id = $1 AND workspace_id = $2 ORDER BY created_at ASC`,
        [projectId, workspaceId]
      );
      return res.rows;
    });
  }

  /**
   * Obtiene todas las fases de un proyecto
   */
  public async getPhases(workspaceId: string, projectId: string): Promise<DmaicPhaseRecord[]> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const res = await client.query(
        `SELECT * FROM dmaic_phases WHERE project_id = $1 AND workspace_id = $2 ORDER BY created_at ASC`,
        [projectId, workspaceId]
      );
      if (res.rows.length === 0) {
        return await this.initializeProjectDmaic(workspaceId, projectId);
      }
      return res.rows;
    });
  }

  /**
   * Obtiene una fase específica
   */
  public async getPhase(workspaceId: string, projectId: string, phase: DmaicPhaseType): Promise<DmaicPhaseRecord | null> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const res = await client.query(
        `SELECT * FROM dmaic_phases WHERE project_id = $1 AND workspace_id = $2 AND phase = $3`,
        [projectId, workspaceId, phase]
      );
      if (res.rows.length === 0) return null;
      return res.rows[0];
    });
  }

  /**
   * Actualiza el contenido de una fase
   */
  public async updatePhase(
    workspaceId: string,
    projectId: string,
    phase: DmaicPhaseType,
    data: Partial<DmaicPhaseRecord>
  ): Promise<DmaicPhaseRecord> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const fields: string[] = ['updated_at = CURRENT_TIMESTAMP'];
      const values: unknown[] = [projectId, workspaceId, phase];
      let idx = 4;

      if (data.charter_problem_statement !== undefined) {
        fields.push(`charter_problem_statement = $${idx++}`);
        values.push(data.charter_problem_statement);
      }
      if (data.charter_business_case !== undefined) {
        fields.push(`charter_business_case = $${idx++}`);
        values.push(data.charter_business_case);
      }
      if (data.charter_goal !== undefined) {
        fields.push(`charter_goal = $${idx++}`);
        values.push(data.charter_goal);
      }
      if (data.charter_scope !== undefined) {
        fields.push(`charter_scope = $${idx++}`);
        values.push(data.charter_scope);
      }
      if (data.sipoc_data !== undefined) {
        fields.push(`sipoc_data = $${idx++}`);
        values.push(JSON.stringify(data.sipoc_data));
      }
      if (data.measure_baseline_metrics !== undefined) {
        fields.push(`measure_baseline_metrics = $${idx++}`);
        values.push(JSON.stringify(data.measure_baseline_metrics));
      }
      if (data.analyze_findings !== undefined) {
        fields.push(`analyze_findings = $${idx++}`);
        values.push(JSON.stringify(data.analyze_findings));
      }
      if (data.improve_action_plan !== undefined) {
        fields.push(`improve_action_plan = $${idx++}`);
        values.push(JSON.stringify(data.improve_action_plan));
      }
      if (data.control_plan !== undefined) {
        fields.push(`control_plan = $${idx++}`);
        values.push(JSON.stringify(data.control_plan));
      }

      const res = await client.query(
        `UPDATE dmaic_phases
         SET ${fields.join(', ')}
         WHERE project_id = $1 AND workspace_id = $2 AND phase = $3
         RETURNING *`,
        values
      );
      return res.rows[0];
    });
  }

  /**
   * FLUJO DE GÉNESIS: Aprobación del Tollgate DEFINE -> Generación Automática del Blueprint DAG
   */
  public async approveTollgate(
    workspaceId: string,
    projectId: string,
    phase: DmaicPhaseType,
    approvedBy?: string | null
  ): Promise<{ phase: DmaicPhaseRecord; blueprint?: { workflowId: string; nodeIds: string[]; edgeCount: number; taskCount: number } }> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      // 1. Aprobar el tollgate
      const approveRes = await client.query(
        `UPDATE dmaic_phases
         SET tollgate_status = 'APPROVED',
             approved_at = CURRENT_TIMESTAMP,
             approved_by = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE project_id = $2 AND workspace_id = $3 AND phase = $4
         RETURNING *`,
        [approvedBy || null, projectId, workspaceId, phase]
      );

      if (approveRes.rows.length === 0) {
        throw new Error(`DMAIC phase '${phase}' not found for project ${projectId}.`);
      }
      const updatedPhase: DmaicPhaseRecord = approveRes.rows[0];

      let blueprintResult: { workflowId: string; nodeIds: string[]; edgeCount: number; taskCount: number } | undefined;

      // 2. Si es la fase DEFINE, disparar el FLUJO DE GÉNESIS
      if (phase === 'DEFINE') {
        const projRes = await client.query(
          `SELECT name, tech_stack FROM projects WHERE id = $1 AND workspace_id = $2`,
          [projectId, workspaceId]
        );
        const techStack = projRes.rows[0]?.tech_stack || {};

        // A. Generar topología DAG y tareas técnicas en RED y TODO
        const bp = await BlueprintEngineService.generate(client, projectId, techStack);

        // B. Inicializar columnas Kanban del proyecto si no existen
        const kanbanCols = await this.agileService.getKanbanColumns(workspaceId, projectId);
        const todoColId = kanbanCols.find((c: any) => c.position === 0)?.id || null;

        // C. Asignar columna Kanban y sincronizar fechas objetivo con calendar_events
        const tasksRes = await client.query(
          `SELECT pt.id, pt.title, pt.description, pt.priority, pt.status, pt.start_date, pt.due_date
           FROM project_tasks pt
           WHERE pt.project_id = $1 AND pt.workspace_id = $2`,
          [projectId, workspaceId]
        );

        let taskCounter = 1;
        for (const task of tasksRes.rows) {
          const startDate = task.start_date || new Date().toISOString();
          const dueDate = task.due_date || new Date(Date.now() + taskCounter * 24 * 3600 * 1000).toISOString();

          await client.query(
            `UPDATE project_tasks
             SET kanban_column_id = COALESCE(kanban_column_id, $1),
                 kanban_position = $2,
                 start_date = $3,
                 due_date = $4
             WHERE id = $5`,
            [todoColId, taskCounter, startDate, dueDate, task.id]
          );

          // Sincronizar con calendar_events
          await client.query(
            `INSERT INTO calendar_events (
               workspace_id, project_id, title, description, start_date, due_date,
               event_type, reference_id, priority, status
             ) VALUES ($1, $2, $3, $4, $5, $6, 'TASK_DUE', $7, $8, $9)
             ON CONFLICT DO NOTHING`,
            [workspaceId, projectId, task.title, task.description, startDate, dueDate, task.id, task.priority, 'IN_PROGRESS']
          );

          taskCounter++;
        }

        blueprintResult = {
          workflowId: bp.workflowId,
          nodeIds: bp.nodeIds,
          edgeCount: bp.edgeCount,
          taskCount: tasksRes.rows.length
        };

        // D. Emitir evento central de Génesis
        if (this.orchestrator) {
          await this.orchestrator.emitEvent({
            event_type: 'DMAIC_TOLLGATE_APPROVED',
            workspace_id: workspaceId,
            project_id: projectId,
            entity_id: updatedPhase.id,
            payload: {
              phase: 'DEFINE',
              blueprint: blueprintResult,
              timestamp: new Date().toISOString()
            },
            timestamp: new Date().toISOString()
          });
        }
      }

      return {
        phase: updatedPhase,
        blueprint: blueprintResult
      };
    });
  }

  /**
   * FLUJO DE OBSERVABILIDAD: Ingesta de Telemetría GitHub hacia la Fase CONTROL del DMAIC
   */
  public async ingestControlTelemetry(
    workspaceId: string,
    projectId: string,
    telemetry: {
      duration_ms: number;
      conclusion: string;
      commit_sha: string;
      branch: string;
    }
  ): Promise<{ isCompliant: boolean; movingSuccessRate: number; avgDurationMs: number }> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const phaseRes = await client.query(
        `SELECT * FROM dmaic_phases WHERE project_id = $1 AND workspace_id = $2 AND phase = 'CONTROL'`,
        [projectId, workspaceId]
      );

      let controlPlan: ControlPlan = phaseRes.rows[0]?.control_plan || {
        tolerance_min_duration_ms: 0,
        tolerance_max_duration_ms: 300000,
        min_success_rate: 95.0,
        telemetry_logs: []
      };

      const isSuccess = telemetry.conclusion === 'success';
      const withinTolerance = telemetry.duration_ms <= controlPlan.tolerance_max_duration_ms && isSuccess;

      controlPlan.telemetry_logs.push({
        duration_ms: telemetry.duration_ms,
        conclusion: telemetry.conclusion,
        commit_sha: telemetry.commit_sha,
        branch: telemetry.branch,
        timestamp: new Date().toISOString(),
        within_tolerance: withinTolerance
      });

      // Mantener los últimos 50 registros
      if (controlPlan.telemetry_logs.length > 50) {
        controlPlan.telemetry_logs = controlPlan.telemetry_logs.slice(-50);
      }

      // Calcular tasa de éxito y duración promedio
      const totalLogs = controlPlan.telemetry_logs.length;
      const successLogs = controlPlan.telemetry_logs.filter(l => l.conclusion === 'success').length;
      const movingSuccessRate = totalLogs > 0 ? (successLogs / totalLogs) * 100 : 100;
      const avgDurationMs = totalLogs > 0
        ? controlPlan.telemetry_logs.reduce((acc, l) => acc + l.duration_ms, 0) / totalLogs
        : telemetry.duration_ms;

      const isCompliant = movingSuccessRate >= controlPlan.min_success_rate && avgDurationMs <= controlPlan.tolerance_max_duration_ms;

      await client.query(
        `UPDATE dmaic_phases
         SET control_plan = $1, updated_at = CURRENT_TIMESTAMP
         WHERE project_id = $2 AND workspace_id = $3 AND phase = 'CONTROL'`,
        [JSON.stringify(controlPlan), projectId, workspaceId]
      );

      if (!isCompliant && this.orchestrator) {
        await this.orchestrator.emitEvent({
          event_type: 'DMAIC_CONTROL_OUT_OF_TOLERANCE',
          workspace_id: workspaceId,
          project_id: projectId,
          payload: {
            movingSuccessRate,
            avgDurationMs,
            tolerance_max_duration_ms: controlPlan.tolerance_max_duration_ms,
            min_success_rate: controlPlan.min_success_rate
          },
          timestamp: new Date().toISOString()
        });
      }

      return {
        isCompliant,
        movingSuccessRate,
        avgDurationMs
      };
    });
  }

  /**
   * BUCLE DE SOLUCIÓN DE PROBLEMAS: Crea borrador de análisis causal en Ishikawa y 5 Porqués
   */
  public async triggerCausalAnalysisDraft(
    workspaceId: string,
    projectId: string,
    problemDetail: {
      title: string;
      problemStatement: string;
      suspectedCategory?: 'MANPOWER' | 'MACHINERY' | 'METHODS' | 'MATERIALS' | 'MEASUREMENT' | 'ENVIRONMENT';
      commit_sha?: string;
    }
  ): Promise<{ ishikawaId: string; fiveWhysId: string }> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      // 1. Crear diagrama de Ishikawa en fase ANALYZE
      const ishikawaRes = await client.query(
        `INSERT INTO opex_ishikawa_diagrams (workspace_id, project_id, title, problem_statement)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [workspaceId, projectId, problemDetail.title, problemDetail.problemStatement]
      );
      const ishikawaId = ishikawaRes.rows[0].id;

      // Factores estándar para las 6M
      const category = problemDetail.suspectedCategory || 'METHODS';
      await client.query(
        `INSERT INTO opex_ishikawa_factors (diagram_id, workspace_id, category, factor_text, weight, votes, is_critical)
         VALUES ($1, $2, $3, $4, 5, 3, true)`,
        [ishikawaId, workspaceId, category, `Fallo recurrente detectado en ejecución técnica: ${problemDetail.problemStatement}`]
      );

      // 2. Crear análisis de 5 Porqués
      const fiveWhysRes = await client.query(
        `INSERT INTO opex_five_whys (
           workspace_id, project_id, problem, why_1, why_2, why_3, why_4, why_5, root_cause
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          workspaceId,
          projectId,
          problemDetail.problemStatement,
          '¿Por qué falló el proceso técnico? -> Errores en la ejecución del flujo o pruebas.',
          '¿Por qué se produjeron errores? -> Dependencias desalineadas o condiciones no controladas.',
          '¿Por qué estaban desalineadas? -> Falta de validación estricta en el gate previo.',
          '¿Por qué faltó validación? -> Ausencia de un control automatizado de tolerancias.',
          '¿Por qué no existía control? -> El plan de control requería actualización para esta arquitectura.',
          'Causa Raíz Confirmada: Brecha en el plan de control y validación de tipos/dependencias en runtime.'
        ]
      );
      const fiveWhysId = fiveWhysRes.rows[0].id;

      // 3. Emitir evento unificado
      if (this.orchestrator) {
        await this.orchestrator.emitEvent({
          event_type: 'OPEX_CAUSAL_ANALYSIS_DRAFTED',
          workspace_id: workspaceId,
          project_id: projectId,
          payload: {
            ishikawaId,
            fiveWhysId,
            problemStatement: problemDetail.problemStatement
          },
          timestamp: new Date().toISOString()
        });
      }

      return { ishikawaId, fiveWhysId };
    });
  }
}
