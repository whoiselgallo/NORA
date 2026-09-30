import { Pool, PoolClient } from 'pg';
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
   * Asegura la existencia del registro maestro en dmaic_projects
   */
  private async ensureDmaicProject(
    client: PoolClient,
    workspaceId: string,
    projectId: string
  ): Promise<string> {
    const res = await client.query(
      `INSERT INTO dmaic_projects (workspace_id, project_id, active_phase)
       VALUES ($1, $2, 'DEFINE')
       ON CONFLICT (project_id) DO UPDATE
       SET updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [workspaceId, projectId]
    );
    return res.rows[0].id;
  }

  /**
   * Reconstruye las 5 fases normalizadas hacia la firma unificada DmaicPhaseRecord
   */
  private async fetchPhasesByDmaicId(
    client: PoolClient,
    workspaceId: string,
    projectId: string,
    dmaicId: string
  ): Promise<DmaicPhaseRecord[]> {
    const [defRes, measRes, anaRes, impRes, ctrlRes] = await Promise.all([
      client.query(`SELECT * FROM dmaic_define_phase WHERE dmaic_id = $1`, [dmaicId]),
      client.query(`SELECT * FROM dmaic_measure_phase WHERE dmaic_id = $1`, [dmaicId]),
      client.query(`SELECT * FROM dmaic_analyze_phase WHERE dmaic_id = $1`, [dmaicId]),
      client.query(`SELECT * FROM dmaic_improve_phase WHERE dmaic_id = $1`, [dmaicId]),
      client.query(`SELECT * FROM dmaic_control_phase WHERE dmaic_id = $1`, [dmaicId])
    ]);

    const def = defRes.rows[0];
    const meas = measRes.rows[0];
    const ana = anaRes.rows[0];
    const imp = impRes.rows[0];
    const ctrl = ctrlRes.rows[0];

    const emptySipoc: SipocData = { suppliers: [], inputs: [], process: [], outputs: [], customers: [] };
    const emptyMetrics: MeasureBaselineMetrics = { defect_rate: 0, cycle_time_hours: 0, dpmo: 0, sigma_level: 0 };
    const emptyControlPlan: ControlPlan = {
      tolerance_min_duration_ms: 0,
      tolerance_max_duration_ms: 180000,
      min_success_rate: 95.0,
      telemetry_logs: []
    };

    const phases: DmaicPhaseRecord[] = [
      {
        id: def?.id || dmaicId,
        workspace_id: workspaceId,
        project_id: projectId,
        phase: 'DEFINE',
        tollgate_status: (def?.tollgate_status as TollgateStatus) || 'PENDING',
        approved_at: def?.approved_at ? new Date(def.approved_at).toISOString() : null,
        approved_by: def?.approved_by || null,
        charter_problem_statement: def?.problem_statement || null,
        charter_business_case: def?.business_case || null,
        charter_goal: def?.goal_statement || null,
        charter_scope: def?.scope_in_boundary || null,
        sipoc_data: (def?.sipoc && Object.keys(def.sipoc).length > 0) ? def.sipoc : emptySipoc,
        measure_baseline_metrics: emptyMetrics,
        analyze_findings: {},
        improve_action_plan: {},
        control_plan: emptyControlPlan,
        created_at: def?.created_at ? new Date(def.created_at).toISOString() : new Date().toISOString(),
        updated_at: def?.created_at ? new Date(def.created_at).toISOString() : new Date().toISOString()
      },
      {
        id: meas?.id || dmaicId,
        workspace_id: workspaceId,
        project_id: projectId,
        phase: 'MEASURE',
        tollgate_status: (meas?.tollgate_status as TollgateStatus) || 'PENDING',
        approved_at: meas?.approved_at ? new Date(meas.approved_at).toISOString() : null,
        approved_by: meas?.approved_by || null,
        charter_problem_statement: null,
        charter_business_case: null,
        charter_goal: null,
        charter_scope: null,
        sipoc_data: emptySipoc,
        measure_baseline_metrics: {
          defect_rate: meas?.defects_count ?? 4.5,
          cycle_time_hours: 48,
          dpmo: Number(meas?.dpmo) || 3400,
          sigma_level: Number(meas?.sigma_level) || 4.2
        },
        analyze_findings: {},
        improve_action_plan: {},
        control_plan: emptyControlPlan,
        created_at: meas?.created_at ? new Date(meas.created_at).toISOString() : new Date().toISOString(),
        updated_at: meas?.created_at ? new Date(meas.created_at).toISOString() : new Date().toISOString()
      },
      {
        id: ana?.id || dmaicId,
        workspace_id: workspaceId,
        project_id: projectId,
        phase: 'ANALYZE',
        tollgate_status: (ana?.tollgate_status as TollgateStatus) || 'PENDING',
        approved_at: ana?.approved_at ? new Date(ana.approved_at).toISOString() : null,
        approved_by: ana?.approved_by || null,
        charter_problem_statement: null,
        charter_business_case: null,
        charter_goal: null,
        charter_scope: null,
        sipoc_data: emptySipoc,
        measure_baseline_metrics: emptyMetrics,
        analyze_findings: {
          root_causes_summary: ana?.root_causes_summary || null,
          verified_hypotheses: ana?.verified_hypotheses || [],
          ishikawa_diagram_id: ana?.ishikawa_diagram_id || null,
          five_whys_id: ana?.five_whys_id || null
        },
        improve_action_plan: {},
        control_plan: emptyControlPlan,
        created_at: ana?.created_at ? new Date(ana.created_at).toISOString() : new Date().toISOString(),
        updated_at: ana?.created_at ? new Date(ana.created_at).toISOString() : new Date().toISOString()
      },
      {
        id: imp?.id || dmaicId,
        workspace_id: workspaceId,
        project_id: projectId,
        phase: 'IMPROVE',
        tollgate_status: (imp?.tollgate_status as TollgateStatus) || 'PENDING',
        approved_at: imp?.approved_at ? new Date(imp.approved_at).toISOString() : null,
        approved_by: imp?.approved_by || null,
        charter_problem_statement: null,
        charter_business_case: null,
        charter_goal: null,
        charter_scope: null,
        sipoc_data: emptySipoc,
        measure_baseline_metrics: emptyMetrics,
        analyze_findings: {},
        improve_action_plan: {
          impact_effort_matrix: imp?.impact_effort_matrix || [],
          fmea_analysis: imp?.fmea_analysis || [],
          pilot_results: imp?.pilot_results || '',
          action_plan_tasks: imp?.action_plan_tasks || []
        },
        control_plan: emptyControlPlan,
        created_at: imp?.created_at ? new Date(imp.created_at).toISOString() : new Date().toISOString(),
        updated_at: imp?.created_at ? new Date(imp.created_at).toISOString() : new Date().toISOString()
      },
      {
        id: ctrl?.id || dmaicId,
        workspace_id: workspaceId,
        project_id: projectId,
        phase: 'CONTROL',
        tollgate_status: (ctrl?.tollgate_status as TollgateStatus) || 'PENDING',
        approved_at: ctrl?.approved_at ? new Date(ctrl.approved_at).toISOString() : null,
        approved_by: ctrl?.approved_by || null,
        charter_problem_statement: null,
        charter_business_case: null,
        charter_goal: null,
        charter_scope: null,
        sipoc_data: emptySipoc,
        measure_baseline_metrics: emptyMetrics,
        analyze_findings: {},
        improve_action_plan: {},
        control_plan: {
          tolerance_min_duration_ms: ctrl?.tolerance_min_duration_ms ?? 0,
          tolerance_max_duration_ms: ctrl?.tolerance_max_duration_ms ?? 180000,
          min_success_rate: Number(ctrl?.min_success_rate) || 95.0,
          telemetry_logs: ctrl?.telemetry_logs || []
        },
        created_at: ctrl?.created_at ? new Date(ctrl.created_at).toISOString() : new Date().toISOString(),
        updated_at: ctrl?.created_at ? new Date(ctrl.created_at).toISOString() : new Date().toISOString()
      }
    ];

    return phases;
  }

  /**
   * Inicializa las 5 fases DMAIC para un proyecto persistiendo en las tablas normalizadas
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

      const dmaicId = await this.ensureDmaicProject(client, workspaceId, projectId);

      // 1. DEFINE PHASE
      await client.query(
        `INSERT INTO dmaic_define_phase (
           dmaic_id, problem_statement, business_case, goal_statement, scope_in_boundary, sipoc, tollgate_status
         ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
         ON CONFLICT (dmaic_id) DO UPDATE
         SET problem_statement = COALESCE(EXCLUDED.problem_statement, dmaic_define_phase.problem_statement),
             scope_in_boundary = COALESCE(EXCLUDED.scope_in_boundary, dmaic_define_phase.scope_in_boundary)`,
        [
          dmaicId,
          initialCharter?.problemStatement || 'Optimizar flujo de entrega de software y calidad operativa.',
          initialCharter?.businessCase || 'Asegurar tolerancia cero a defectos y entrega automatizada con CI/CD.',
          initialCharter?.goal || 'Alcanzar estabilidad técnica y despliegue automatizado con trazabilidad completa.',
          initialCharter?.scope || 'Módulos Core, Telemetría, Seguridad RLS y Pipeline CI/CD.',
          JSON.stringify(defaultSipoc)
        ]
      );

      // 2. MEASURE PHASE
      await client.query(
        `INSERT INTO dmaic_measure_phase (
           dmaic_id, dpmo, sigma_level, data_collection_plan, tollgate_status
         ) VALUES ($1, $2, $3, $4, 'PENDING')
         ON CONFLICT (dmaic_id) DO NOTHING`,
        [dmaicId, defaultMetrics.dpmo, defaultMetrics.sigma_level, 'Recolección automática de telemetría y build artifacts']
      );

      // 3. ANALYZE PHASE
      await client.query(
        `INSERT INTO dmaic_analyze_phase (
           dmaic_id, verified_hypotheses, tollgate_status
         ) VALUES ($1, '[]'::jsonb, 'PENDING')
         ON CONFLICT (dmaic_id) DO NOTHING`,
        [dmaicId]
      );

      // 4. IMPROVE PHASE
      await client.query(
        `INSERT INTO dmaic_improve_phase (
           dmaic_id, impact_effort_matrix, fmea_analysis, tollgate_status
         ) VALUES ($1, '[]'::jsonb, '[]'::jsonb, 'PENDING')
         ON CONFLICT (dmaic_id) DO NOTHING`,
        [dmaicId]
      );

      // 5. CONTROL PHASE
      await client.query(
        `INSERT INTO dmaic_control_phase (
           dmaic_id, tolerance_min_duration_ms, tolerance_max_duration_ms, min_success_rate, telemetry_logs, tollgate_status
         ) VALUES ($1, 0, 180000, 95.0, '[]'::jsonb, 'PENDING')
         ON CONFLICT (dmaic_id) DO NOTHING`,
        [dmaicId]
      );

      return await this.fetchPhasesByDmaicId(client, workspaceId, projectId, dmaicId);
    });
  }

  /**
   * Obtiene todas las fases de un proyecto
   */
  public async getPhases(workspaceId: string, projectId: string): Promise<DmaicPhaseRecord[]> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const projRes = await client.query(
        `SELECT id FROM dmaic_projects WHERE project_id = $1 AND workspace_id = $2`,
        [projectId, workspaceId]
      );
      if (projRes.rows.length === 0) {
        return await this.initializeProjectDmaic(workspaceId, projectId);
      }
      return await this.fetchPhasesByDmaicId(client, workspaceId, projectId, projRes.rows[0].id);
    });
  }

  /**
   * Obtiene una fase específica
   */
  public async getPhase(workspaceId: string, projectId: string, phase: DmaicPhaseType): Promise<DmaicPhaseRecord | null> {
    const phases = await this.getPhases(workspaceId, projectId);
    return phases.find(p => p.phase === phase) || null;
  }

  /**
   * Actualiza el contenido de una fase en las tablas normalizadas
   */
  public async updatePhase(
    workspaceId: string,
    projectId: string,
    phase: DmaicPhaseType,
    data: Partial<DmaicPhaseRecord>
  ): Promise<DmaicPhaseRecord> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const dmaicId = await this.ensureDmaicProject(client, workspaceId, projectId);

      if (phase === 'DEFINE') {
        const fields: string[] = [];
        const values: unknown[] = [dmaicId];
        let idx = 2;

        if (data.charter_problem_statement !== undefined) {
          fields.push(`problem_statement = $${idx++}`);
          values.push(data.charter_problem_statement);
        }
        if (data.charter_business_case !== undefined) {
          fields.push(`business_case = $${idx++}`);
          values.push(data.charter_business_case);
        }
        if (data.charter_goal !== undefined) {
          fields.push(`goal_statement = $${idx++}`);
          values.push(data.charter_goal);
        }
        if (data.charter_scope !== undefined) {
          fields.push(`scope_in_boundary = $${idx++}`);
          values.push(data.charter_scope);
        }
        if (data.sipoc_data !== undefined) {
          fields.push(`sipoc = $${idx++}`);
          values.push(JSON.stringify(data.sipoc_data));
        }

        if (fields.length > 0) {
          await client.query(
            `UPDATE dmaic_define_phase SET ${fields.join(', ')} WHERE dmaic_id = $1`,
            values
          );
        }
      } else if (phase === 'MEASURE') {
        const fields: string[] = [];
        const values: unknown[] = [dmaicId];
        let idx = 2;

        if (data.measure_baseline_metrics !== undefined) {
          if (data.measure_baseline_metrics.dpmo !== undefined) {
            fields.push(`dpmo = $${idx++}`);
            values.push(data.measure_baseline_metrics.dpmo);
          }
          if (data.measure_baseline_metrics.sigma_level !== undefined) {
            fields.push(`sigma_level = $${idx++}`);
            values.push(data.measure_baseline_metrics.sigma_level);
          }
        }

        if (fields.length > 0) {
          await client.query(
            `UPDATE dmaic_measure_phase SET ${fields.join(', ')} WHERE dmaic_id = $1`,
            values
          );
        }
      } else if (phase === 'ANALYZE') {
        if (data.analyze_findings !== undefined) {
          await client.query(
            `UPDATE dmaic_analyze_phase
             SET verified_hypotheses = $2
             WHERE dmaic_id = $1`,
            [dmaicId, JSON.stringify(data.analyze_findings.verified_hypotheses || [])]
          );
        }
      } else if (phase === 'IMPROVE') {
        if (data.improve_action_plan !== undefined) {
          await client.query(
            `UPDATE dmaic_improve_phase
             SET impact_effort_matrix = $2
             WHERE dmaic_id = $1`,
            [dmaicId, JSON.stringify(data.improve_action_plan.impact_effort_matrix || [])]
          );
        }
      } else if (phase === 'CONTROL') {
        if (data.control_plan !== undefined) {
          await client.query(
            `UPDATE dmaic_control_phase
             SET telemetry_logs = $2, tolerance_max_duration_ms = $3, min_success_rate = $4
             WHERE dmaic_id = $1`,
            [
              JSON.stringify(data.control_plan.telemetry_logs || []),
              data.control_plan.tolerance_max_duration_ms || 180000,
              data.control_plan.min_success_rate || 95.0
            ]
          );
        }
      }

      const phases = await this.fetchPhasesByDmaicId(client, workspaceId, projectId, dmaicId);
      const updated = phases.find(p => p.phase === phase);
      if (!updated) {
        throw new Error(`DMAIC phase '${phase}' not found after update.`);
      }
      return updated;
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
      const dmaicId = await this.ensureDmaicProject(client, workspaceId, projectId);

      const phaseTableMap: Record<DmaicPhaseType, string> = {
        DEFINE: 'dmaic_define_phase',
        MEASURE: 'dmaic_measure_phase',
        ANALYZE: 'dmaic_analyze_phase',
        IMPROVE: 'dmaic_improve_phase',
        CONTROL: 'dmaic_control_phase'
      };

      const targetTable = phaseTableMap[phase];
      await client.query(
        `UPDATE ${targetTable}
         SET tollgate_status = 'APPROVED',
             approved_at = CURRENT_TIMESTAMP,
             approved_by = $1
         WHERE dmaic_id = $2`,
        [approvedBy || null, dmaicId]
      );

      // Avanzar active_phase en dmaic_projects
      const nextPhaseMap: Record<DmaicPhaseType, DmaicPhaseType | null> = {
        DEFINE: 'MEASURE',
        MEASURE: 'ANALYZE',
        ANALYZE: 'IMPROVE',
        IMPROVE: 'CONTROL',
        CONTROL: null
      };
      const nextPhase = nextPhaseMap[phase];
      if (nextPhase) {
        await client.query(
          `UPDATE dmaic_projects SET active_phase = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [nextPhase, dmaicId]
        );
      }

      const allPhases = await this.fetchPhasesByDmaicId(client, workspaceId, projectId, dmaicId);
      const updatedPhase = allPhases.find(p => p.phase === phase);
      if (!updatedPhase) {
        throw new Error(`DMAIC phase '${phase}' not found for project ${projectId}.`);
      }

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
      const dmaicId = await this.ensureDmaicProject(client, workspaceId, projectId);

      const ctrlRes = await client.query(
        `SELECT tolerance_min_duration_ms, tolerance_max_duration_ms, min_success_rate, telemetry_logs 
         FROM dmaic_control_phase WHERE dmaic_id = $1`,
        [dmaicId]
      );

      const ctrlRow = ctrlRes.rows[0];
      const maxTolerance = ctrlRow?.tolerance_max_duration_ms ?? 300000;
      const minSuccess = Number(ctrlRow?.min_success_rate) || 95.0;
      let logs: Array<any> = ctrlRow?.telemetry_logs || [];

      const isSuccess = telemetry.conclusion === 'success';
      const withinTolerance = telemetry.duration_ms <= maxTolerance && isSuccess;

      logs.push({
        duration_ms: telemetry.duration_ms,
        conclusion: telemetry.conclusion,
        commit_sha: telemetry.commit_sha,
        branch: telemetry.branch,
        timestamp: new Date().toISOString(),
        within_tolerance: withinTolerance
      });

      // Mantener los últimos 50 registros
      if (logs.length > 50) {
        logs = logs.slice(-50);
      }

      // Calcular tasa de éxito y duración promedio
      const totalLogs = logs.length;
      const successLogs = logs.filter((l: any) => l.conclusion === 'success').length;
      const movingSuccessRate = totalLogs > 0 ? (successLogs / totalLogs) * 100 : 100;
      const avgDurationMs = totalLogs > 0
        ? logs.reduce((acc: number, l: any) => acc + l.duration_ms, 0) / totalLogs
        : telemetry.duration_ms;

      const isCompliant = movingSuccessRate >= minSuccess && avgDurationMs <= maxTolerance;

      await client.query(
        `UPDATE dmaic_control_phase
         SET telemetry_logs = $1
         WHERE dmaic_id = $2`,
        [JSON.stringify(logs), dmaicId]
      );

      if (!isCompliant && this.orchestrator) {
        await this.orchestrator.emitEvent({
          event_type: 'DMAIC_CONTROL_OUT_OF_TOLERANCE',
          workspace_id: workspaceId,
          project_id: projectId,
          payload: {
            movingSuccessRate,
            avgDurationMs,
            tolerance_max_duration_ms: maxTolerance,
            min_success_rate: minSuccess
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
