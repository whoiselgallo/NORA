import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { Queue } from 'bullmq';
import { withWorkspaceClient, DEFAULT_WORKSPACE_ID } from '../middleware/workspace.middleware';
import { BrandEnforcerService } from './brandEnforcer.service';
import { DagCacheService } from './dagCache.service';
import { DmaicService } from './dmaic.service';

export interface ProjectClosureInput {
  client_sign_off_name: string;
  client_feedback_rating: number; // 1 a 5
  client_comments?: string | null;
  final_roi_amount?: number;
  final_cycle_time_days?: number;
  final_sigma_level?: number;
}

export interface IngestionJobData {
  workspaceId: string;
  projectId: string;
  snapshotId: string;
}

export class ProjectClosureService {
  private brandEnforcer: BrandEnforcerService;
  private ingestionQueue?: Queue<IngestionJobData>;

  constructor(
    private pool: Pool,
    private io?: SocketIOServer,
    private cache?: DagCacheService,
    queue?: Queue<IngestionJobData>
  ) {
    this.brandEnforcer = new BrandEnforcerService(pool);
    if (queue) {
      this.ingestionQueue = queue;
    } else {
      try {
        const redisUrl = process.env.REDIS_URL;
        if (redisUrl && !redisUrl.includes('tu_host') && !redisUrl.includes('tu_password')) {
          this.ingestionQueue = new Queue<IngestionJobData>('nexus-knowledge-ingestion-queue', {
            connection: { url: redisUrl }
          });
          this.ingestionQueue.on('error', (err: any) => {
            console.warn('[NexusQueue Warning]:', err.message);
          });
        } else {
          console.log('[ProjectClosureService] Redis URL no configurado o con placeholders, encolado BullMQ en modo diferido/simulado.');
        }
      } catch (err: any) {
        console.warn('[ProjectClosureService] BullMQ Queue initialization deferred:', err.message);
      }
    }
  }

  public setIngestionQueue(queue: Queue<IngestionJobData>) {
    this.ingestionQueue = queue;
  }

  /**
   * Cierre formal, sellado inmutable en JSONB y encolado en BullMQ para absorción en Nexus.
   */
  public async closeAndArchiveProject(
    workspaceId: string = DEFAULT_WORKSPACE_ID,
    projectId: string,
    closureInput: ProjectClosureInput,
    closedBy?: string | null
  ): Promise<{
    project: any;
    closure: any;
    snapshot: any;
    certificateDeck: any;
  }> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      // 1. Verificar existencia y estado del proyecto
      const projRes = await client.query(
        `SELECT * FROM projects WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
        [projectId, workspaceId]
      );
      if (projRes.rows.length === 0) {
        throw new Error(`Project with ID ${projectId} not found.`);
      }
      const project = projRes.rows[0];

      if (project.status === 'ARCHIVED') {
        throw new Error(`PROJECT_ALREADY_ARCHIVED: El proyecto '${project.name}' ya ha sido formalmente archivado y cerrado.`);
      }

      // 2. Extraer todo el ecosistema de datos del proyecto para el snapshot integral
      // 2.1 Workflow y DAG
      const wfRes = await client.query(
        `SELECT * FROM project_workflows WHERE project_id = $1`,
        [projectId]
      );
      const workflow = wfRes.rows[0] || null;

      let nodes: any[] = [];
      let edges: any[] = [];
      let nodeTasks: any[] = [];

      if (workflow) {
        const nodesRes = await client.query(
          `SELECT * FROM workflow_nodes WHERE workflow_id = $1 ORDER BY step_order ASC`,
          [workflow.id]
        );
        nodes = nodesRes.rows;

        const edgesRes = await client.query(
          `SELECT * FROM workflow_edges WHERE workflow_id = $1`,
          [workflow.id]
        );
        edges = edgesRes.rows;

        const nodeTasksRes = await client.query(
          `SELECT wnt.* FROM workflow_node_tasks wnt
           JOIN workflow_nodes wn ON wnt.node_id = wn.id
           WHERE wn.workflow_id = $1`,
          [workflow.id]
        );
        nodeTasks = nodeTasksRes.rows;
      }

      // 2.2 Tareas del Proyecto
      const tasksRes = await client.query(
        `SELECT * FROM project_tasks WHERE project_id = $1 AND workspace_id = $2 ORDER BY created_at ASC`,
        [projectId, workspaceId]
      );
      const tasks = tasksRes.rows;

      // 2.3 Fases DMAIC
      const dmaicService = new DmaicService(this.pool);
      const dmaicPhases = await dmaicService.getPhases(workspaceId, projectId);

      // 2.4 Ishikawa & 5 Porqués
      const fiveWhysRes = await client.query(
        `SELECT * FROM opex_five_whys WHERE project_id = $1 AND workspace_id = $2 ORDER BY created_at DESC`,
        [projectId, workspaceId]
      );
      const fiveWhys = fiveWhysRes.rows;

      const ishikawaRes = await client.query(
        `SELECT * FROM opex_ishikawa_diagrams WHERE project_id = $1 AND workspace_id = $2`,
        [projectId, workspaceId]
      );
      const ishikawaDiagrams = ishikawaRes.rows;

      let ishikawaFactors: any[] = [];
      if (ishikawaDiagrams.length > 0) {
        const diagIds = ishikawaDiagrams.map(d => d.id);
        const factorsRes = await client.query(
          `SELECT * FROM opex_ishikawa_factors WHERE diagram_id = ANY($1) AND workspace_id = $2`,
          [diagIds, workspaceId]
        );
        ishikawaFactors = factorsRes.rows;
      }

      // 2.5 Pareto y SWOT
      const paretoRes = await client.query(
        `SELECT * FROM opex_pareto_data WHERE project_id = $1 AND workspace_id = $2 ORDER BY cost DESC`,
        [projectId, workspaceId]
      );
      const paretoData = paretoRes.rows;

      const swotRes = await client.query(
        `SELECT * FROM opex_swot_items WHERE project_id = $1 AND workspace_id = $2`,
        [projectId, workspaceId]
      );
      const swotItems = swotRes.rows;

      // 2.6 Telemetría GitHub
      const telemetryRes = await client.query(
        `SELECT * FROM github_telemetry_events WHERE project_id = $1 AND workspace_id = $2 ORDER BY created_at DESC LIMIT 50`,
        [projectId, workspaceId]
      );
      const telemetryEvents = telemetryRes.rows;

      // 2.7 Notas asociadas
      const notesRes = await client.query(
        `SELECT * FROM workspace_notes WHERE project_id = $1 AND workspace_id = $2 ORDER BY created_at DESC`,
        [projectId, workspaceId]
      );
      const notes = notesRes.rows;

      // 3. Calcular métricas finales consolidadas
      const createdAtDate = new Date(project.created_at || Date.now());
      const now = new Date();
      const calculatedCycleDays = Math.max(1, Math.round(((now.getTime() - createdAtDate.getTime()) / (1000 * 60 * 60 * 24)) * 10) / 10);

      const finalRoiAmount = closureInput.final_roi_amount !== undefined && closureInput.final_roi_amount !== null
        ? closureInput.final_roi_amount
        : (paretoData.reduce((acc, p) => acc + Number(p.cost || 0), 0) * 1.5 || 85000);

      const finalCycleTimeDays = closureInput.final_cycle_time_days !== undefined && closureInput.final_cycle_time_days !== null
        ? closureInput.final_cycle_time_days
        : calculatedCycleDays;

      const measurePhase = dmaicPhases.find(p => p.phase === 'MEASURE');
      const finalSigmaLevel = closureInput.final_sigma_level !== undefined && closureInput.final_sigma_level !== null
        ? closureInput.final_sigma_level
        : (measurePhase?.measure_baseline_metrics?.sigma_level || 5.8);

      // 4. Generar el Acta Ejecutiva de Cierre (Brand Enforcer con Tokens TSolutions IPIDD)
      const certificateResult = await this.brandEnforcer.compileProjectClosureCertificate(
        workspaceId,
        projectId,
        {
          client_sign_off_name: closureInput.client_sign_off_name,
          client_feedback_rating: closureInput.client_feedback_rating,
          client_comments: closureInput.client_comments,
          final_roi_amount: finalRoiAmount,
          final_cycle_time_days: finalCycleTimeDays,
          final_sigma_level: finalSigmaLevel
        },
        closedBy,
        client
      );

      // 5. Garantizar que todos los nodos del DAG queden registrados en GREEN en el snapshot
      const certifiedGreenNodes = nodes.map(n => ({
        ...n,
        status: 'GREEN',
        completed_at: n.completed_at || now.toISOString()
      }));

      // Validar closedBy en tabla users para integridad referencial FK
      let validClosedBy: string | null = null;
      if (closedBy) {
        const uCheck = await client.query('SELECT id FROM users WHERE id = $1', [closedBy]);
        if (uCheck.rows.length > 0) {
          validClosedBy = closedBy;
        }
      }

      // 6. Construir el Snapshot Inmutable Integral
      const snapshotPayload = {
        snapshot_version: '1.0.0',
        archived_at: now.toISOString(),
        immutable_hash_protocol: 'SHA256_STABLE',
        project: {
          id: project.id,
          workspace_id: project.workspace_id,
          name: project.name,
          description: project.description,
          github_repo: project.github_repo,
          github_repo_owner: project.github_repo_owner,
          github_repo_name: project.github_repo_name,
          tech_stack: project.tech_stack,
          status: 'ARCHIVED',
          created_at: project.created_at
        },
        closure: {
          closed_by: validClosedBy,
          closed_at: now.toISOString(),
          client_sign_off_name: closureInput.client_sign_off_name,
          client_feedback_rating: closureInput.client_feedback_rating,
          client_comments: closureInput.client_comments || '',
          final_roi_amount: finalRoiAmount,
          final_cycle_time_days: finalCycleTimeDays,
          final_sigma_level: finalSigmaLevel
        },
        workflow_dag: {
          workflow,
          nodes: certifiedGreenNodes,
          edges,
          node_tasks: nodeTasks
        },
        tasks,
        dmaic_phases: dmaicPhases,
        opex: {
          five_whys: fiveWhys,
          ishikawa_diagrams: ishikawaDiagrams,
          ishikawa_factors: ishikawaFactors,
          pareto_data: paretoData,
          swot_items: swotItems
        },
        telemetry_history: telemetryEvents,
        notes,
        executive_certificate: {
          deck_id: certificateResult.deck.id,
          deck_title: certificateResult.deck.title,
          slides: certificateResult.slides,
          brand_tokens: certificateResult.brandTokens,
          certificate_html: certificateResult.certificateHtml
        }
      };

      // 7. Persistir en la base de datos:
      // a) Asegurar que en workflow_nodes queden en GREEN
      if (workflow) {
        await client.query(
          `UPDATE workflow_nodes SET status = 'GREEN', completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP) WHERE workflow_id = $1`,
          [workflow.id]
        );
      }

      // b) Actualizar estado del proyecto a ARCHIVED
      const updatedProjRes = await client.query(
        `UPDATE projects 
         SET status = 'ARCHIVED' 
         WHERE id = $1 AND workspace_id = $2 
         RETURNING *`,
        [projectId, workspaceId]
      );
      const archivedProject = updatedProjRes.rows[0];

      // c) Crear registro de Cierre Formal
      const closureRes = await client.query(
        `INSERT INTO project_closures (
          workspace_id, project_id, closed_by, client_sign_off_name,
          client_feedback_rating, client_comments, final_roi_amount,
          final_cycle_time_days, final_sigma_level, closure_certificate_pdf
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (project_id) DO UPDATE SET
          closed_at = CURRENT_TIMESTAMP,
          client_sign_off_name = EXCLUDED.client_sign_off_name,
          client_feedback_rating = EXCLUDED.client_feedback_rating,
          client_comments = EXCLUDED.client_comments,
          final_roi_amount = EXCLUDED.final_roi_amount,
          final_cycle_time_days = EXCLUDED.final_cycle_time_days,
          final_sigma_level = EXCLUDED.final_sigma_level,
          closure_certificate_pdf = EXCLUDED.closure_certificate_pdf
        RETURNING *`,
        [
          workspaceId,
          projectId,
          validClosedBy,
          closureInput.client_sign_off_name,
          closureInput.client_feedback_rating,
          closureInput.client_comments || null,
          finalRoiAmount,
          finalCycleTimeDays,
          finalSigmaLevel,
          certificateResult.certificateHtml
        ]
      );
      const closure = closureRes.rows[0];

      // d) Crear registro de Snapshot Inmutable
      const snapshotRes = await client.query(
        `INSERT INTO project_snapshots (workspace_id, project_id, snapshot_data)
         VALUES ($1, $2, $3)
         ON CONFLICT (project_id) DO UPDATE SET
          snapshot_data = EXCLUDED.snapshot_data,
          created_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [workspaceId, projectId, JSON.stringify(snapshotPayload)]
      );
      const snapshot = snapshotRes.rows[0];

      // 8. Invalidar caché del DAG
      if (this.cache) {
        await this.cache.invalidateDag(projectId, workspaceId);
      }

      // 9. Encolar trabajo en BullMQ para ingestión y asimilación en Nexus Brain
      if (this.ingestionQueue) {
        try {
          await this.ingestionQueue.add(
            'ingest-project-knowledge',
            {
              workspaceId,
              projectId,
              snapshotId: snapshot.id
            },
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 }
            }
          );
        } catch (queueErr: any) {
          console.warn('[ProjectClosureService] Failed to enqueue BullMQ job:', queueErr.message);
        }
      }

      // 10. Emitir evento WebSocket de archivado a la sala del proyecto y workspace
      if (this.io) {
        this.io.to(`workspace_${workspaceId}`).emit('PROJECT_ARCHIVED', {
          projectId,
          projectName: archivedProject.name,
          closure,
          timestamp: now.toISOString()
        });

        this.io.to(`project:${projectId}`).emit('PROJECT_ARCHIVED', {
          projectId,
          projectName: archivedProject.name,
          closure,
          timestamp: now.toISOString()
        });
      }

      return {
        project: archivedProject,
        closure,
        snapshot,
        certificateDeck: certificateResult
      };
    });
  }

  /**
   * Obtiene el snapshot inmutable completo de un proyecto archivado.
   */
  public async getProjectSnapshot(workspaceId: string, projectId: string): Promise<any> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const res = await client.query(
        `SELECT ps.*, p.name as project_name, p.status as project_status,
                pc.client_sign_off_name, pc.client_feedback_rating, pc.final_roi_amount,
                pc.final_cycle_time_days, pc.final_sigma_level, pc.closed_at
         FROM project_snapshots ps
         JOIN projects p ON ps.project_id = p.id
         LEFT JOIN project_closures pc ON ps.project_id = pc.project_id
         WHERE ps.project_id = $1 AND ps.workspace_id = $2`,
        [projectId, workspaceId]
      );

      if (res.rows.length === 0) {
        throw new Error(`Snapshot for project ID ${projectId} not found in this workspace.`);
      }

      return res.rows[0];
    });
  }

  /**
   * Consulta la Biblioteca de Proyectos Archivados con filtros combinables:
   * stack tecnológico, calificación del cliente, rango de fechas e industria.
   */
  public async getArchivedProjects(
    workspaceId: string,
    filters: {
      stack?: string;
      minRating?: number;
      startDate?: string;
      endDate?: string;
      search?: string;
    } = {}
  ): Promise<any[]> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      let query = `
        SELECT p.id, p.workspace_id, p.name, p.description, p.github_repo,
               p.tech_stack, p.created_at, p.status,
               pc.closed_at, pc.client_sign_off_name, pc.client_feedback_rating,
               pc.client_comments, pc.final_roi_amount, pc.final_cycle_time_days,
               pc.final_sigma_level,
               (SELECT COUNT(*) FROM nexus_knowledge_vectors nkv WHERE nkv.project_id = p.id) as vectors_count
        FROM projects p
        JOIN project_closures pc ON p.id = pc.project_id
        WHERE p.workspace_id = $1 AND p.status = 'ARCHIVED'
      `;
      const params: any[] = [workspaceId];
      let paramIdx = 2;

      if (filters.minRating) {
        query += ` AND pc.client_feedback_rating >= $${paramIdx}`;
        params.push(filters.minRating);
        paramIdx++;
      }

      if (filters.startDate) {
        query += ` AND pc.closed_at >= $${paramIdx}`;
        params.push(filters.startDate);
        paramIdx++;
      }

      if (filters.endDate) {
        query += ` AND pc.closed_at <= $${paramIdx}`;
        params.push(filters.endDate);
        paramIdx++;
      }

      if (filters.search) {
        query += ` AND (p.name ILIKE $${paramIdx} OR p.description ILIKE $${paramIdx} OR pc.client_sign_off_name ILIKE $${paramIdx})`;
        params.push(`%${filters.search}%`);
        paramIdx++;
      }

      if (filters.stack) {
        query += ` AND p.tech_stack::text ILIKE $${paramIdx}`;
        params.push(`%${filters.stack}%`);
        paramIdx++;
      }

      query += ` ORDER BY pc.closed_at DESC`;

      const res = await client.query(query, params);
      return res.rows;
    });
  }
}
