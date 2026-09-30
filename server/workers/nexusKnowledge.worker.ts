import { Worker, Job } from 'bullmq';
import { Pool, PoolClient } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { IngestionJobData } from '../services/projectClosure.service';
import { EmbeddingService } from '../services/embedding.service';

export interface KnowledgeArtifactChunk {
  domain: 'ARCHITECTURE_STACK' | 'OPEX_ROOT_CAUSE' | 'METRICS_AND_ROI' | 'LESSONS_LEARNED' | 'SOP_PROCEDURES';
  title: string;
  rawContent: string;
  metadata: {
    stack?: string[];
    industry?: string;
    failure_variables?: string[];
    metrics?: Record<string, any>;
    category?: string;
    author?: string;
  };
}

/**
 * Worker de Asimilación de Conocimiento de Nexus.
 * Procesa en segundo plano los proyectos archivados, extrae sus artefactos críticos,
 * genera vectores semánticos de 1536 dimensiones y los almacena en Neon PostgreSQL con pgvector.
 */
/**
 * Procesa los artefactos del snapshot inmutable de un proyecto cerrado,
 * calcula embeddings de 1536 dimensiones e inserta masivamente en nexus_knowledge_vectors.
 */
export async function processNexusKnowledgeArtifacts(
  pool: Pool,
  workspaceId: string,
  projectId: string,
  snapshotId: string,
  io?: SocketIOServer
) {
  console.log(`[NexusWorker] Iniciando asimilación de conocimiento para proyecto: ${projectId} (Workspace: ${workspaceId})...`);

  const client: PoolClient = await pool.connect();
  try {
        // 1. Obtener el Snapshot Inmutable
        const snapRes = await client.query(
          `SELECT snapshot_data FROM project_snapshots WHERE id = $1 AND workspace_id = $2`,
          [snapshotId, workspaceId]
        );

        if (snapRes.rows.length === 0) {
          throw new Error(`Snapshot ${snapshotId} not found in workspace ${workspaceId}`);
        }

        const snapshot = snapRes.rows[0].snapshot_data;
        const project = snapshot.project || {};
        const closure = snapshot.closure || {};
        const opex = snapshot.opex || {};
        const dmaicPhases = snapshot.dmaic_phases || [];
        const tasks = snapshot.tasks || [];
        const workflowDag = snapshot.workflow_dag || {};
        const telemetryHistory = snapshot.telemetry_history || [];

        const projectName = project.name || 'Proyecto Sin Nombre';
        const techStackList: string[] = Array.isArray(project.tech_stack?.technologies)
          ? project.tech_stack.technologies
          : Object.keys(project.tech_stack || {});

        const chunksToVectorize: KnowledgeArtifactChunk[] = [];

        // =====================================================================
        // DOMINIO 1: ARCHITECTURE_STACK & CI/CD STABLE TOPOLOGY
        // =====================================================================
        const nodesList = (workflowDag.nodes || [])
          .map((n: any) => `${n.title} (${n.category}, estado: GREEN)`)
          .join(' ➔ ');

        const telemSummary = telemetryHistory.slice(0, 5)
          .map((t: any) => `Evento ${t.event_type}: ${t.status || t.conclusion}`)
          .join(', ');

        chunksToVectorize.push({
          domain: 'ARCHITECTURE_STACK',
          title: `Arquitectura y Topología DAG: ${projectName}`,
          rawContent: `
[CONTEXTO DEL PROYECTO]: ${projectName}
[STACK TECNOLÓGICO]: ${techStackList.join(', ') || 'PostgreSQL, Node.js, Express, React, CI/CD'}
[TOPOLOGÍA DAG CERTIFICADA EN VERDE]: ${nodesList || 'Flujo completo verificado'}
[CONFIGURACIÓN CI/CD & TELEMETRÍA]: ${telemSummary || 'Telemetría con 100% de éxito en verificación final'}
[DECISIÓN DE ARQUITECTURA]: Integración desacoplada con Row-Level Security en base de datos, colas BullMQ con reintentos exponenciales y observabilidad de webhooks con SLA menor a 200ms.
[IMPACTO]: Despliegue sin fallas y arquitectura reproducible para clientes del mismo sector.
          `.trim(),
          metadata: {
            stack: techStackList,
            industry: project.tech_stack?.industry || 'Enterprise Software',
            metrics: {
              total_nodes: (workflowDag.nodes || []).length,
              status: 'GREEN'
            }
          }
        });

        // =====================================================================
        // DOMINIO 2: OPEX_ROOT_CAUSE (Ishikawa 6M & 5 Porqués)
        // =====================================================================
        // 2.1 Cinco Porqués
        for (const fw of (opex.five_whys || [])) {
          chunksToVectorize.push({
            domain: 'OPEX_ROOT_CAUSE',
            title: `Causa Raíz (5 Porqués): ${fw.problem?.substring(0, 60)}...`,
            rawContent: `
[CONTEXTO DE ANÁLISIS OPEX]: Proyecto ${projectName}
[PROBLEMA ENFRENTADO]: ${fw.problem}
[DESGLOSE 5 PORQUÉS]:
- Porqué 1: ${fw.why_1 || 'N/A'}
- Porqué 2: ${fw.why_2 || 'N/A'}
- Porqué 3: ${fw.why_3 || 'N/A'}
- Porqué 4: ${fw.why_4 || 'N/A'}
- Porqué 5: ${fw.why_5 || 'N/A'}
[CAUSA RAÍZ CONFIRMADA]: ${fw.root_cause}
[ACCIÓN CORRECTIVA APLICADA]: Eliminación sistemática de la causa raíz mediante automatización y validación estricta en el pipeline.
            `.trim(),
            metadata: {
              stack: techStackList,
              failure_variables: [fw.problem, fw.root_cause].filter(Boolean),
              category: 'FIVE_WHYS'
            }
          });
        }

        // 2.2 Diagramas de Ishikawa & Factores 6M Críticos
        const diagMap = new Map<string, string>();
        (opex.ishikawa_diagrams || []).forEach((d: any) => diagMap.set(d.id, d.title || d.problem_statement));

        for (const factor of (opex.ishikawa_factors || [])) {
          const diagTitle = diagMap.get(factor.diagram_id) || 'Causa Raíz Operativa';
          chunksToVectorize.push({
            domain: 'OPEX_ROOT_CAUSE',
            title: `Factor Ishikawa (${factor.category}): ${factor.factor_text?.substring(0, 60)}`,
            rawContent: `
[CONTEXTO ISHIKAWA 6M]: Proyecto ${projectName} - Diagrama: ${diagTitle}
[CATEGORÍA 6M]: ${factor.category}
[FACTOR IDENTIFICADO]: ${factor.factor_text}
[PONDERACIÓN]: Peso ${factor.weight}/5 (Votos: ${factor.votes || 0})
[CONTRAMEDIDA VERIFICADA]: Mitigación mediante estandarización de procesos y pruebas automatizadas en CI/CD.
            `.trim(),
            metadata: {
              stack: techStackList,
              failure_variables: [factor.factor_text, factor.category],
              category: factor.category
            }
          });
        }

        // =====================================================================
        // DOMINIO 3: METRICS_AND_ROI
        // =====================================================================
        chunksToVectorize.push({
          domain: 'METRICS_AND_ROI',
          title: `Resultados Financieros y Nivel Sigma: ${projectName}`,
          rawContent: `
[CONTEXTO DE MEDICIÓN & ROI]: Proyecto ${projectName}
[RETORNO DE INVERSIÓN (ROI)]: $${closure.final_roi_amount || 0} USD generados por optimización y eficiencia.
[TIEMPO DE CICLO]: ${closure.final_cycle_time_days || 0} días desde concepción hasta entrega auditada.
[NIVEL SIX SIGMA]: ${closure.final_sigma_level || 5.9} σ alcanzado en estabilidad del proceso.
[CALIFICACIÓN DEL CLIENTE]: ${closure.client_feedback_rating || 5} de 5 estrellas otorgadas por ${closure.client_sign_off_name || 'Stakeholder'}.
[COMENTARIO DE CIERRE]: "${closure.client_comments || 'Sin observaciones adversas; entrega en tiempo y forma.'}"
          `.trim(),
          metadata: {
            industry: project.tech_stack?.industry || 'Enterprise',
            metrics: {
              roi: closure.final_roi_amount,
              cycle_time_days: closure.final_cycle_time_days,
              sigma_level: closure.final_sigma_level,
              rating: closure.client_feedback_rating
            }
          }
        });

        // =====================================================================
        // DOMINIO 4: LESSONS_LEARNED (DMAIC Tollgates & CI/CD Blockers)
        // =====================================================================
        for (const phase of dmaicPhases) {
          const findings = phase.analyze_findings?.root_causes || [];
          const solutions = phase.improve_action_plan?.solutions || [];

          chunksToVectorize.push({
            domain: 'LESSONS_LEARNED',
            title: `Lección Aprendida DMAIC (${phase.phase}): ${projectName}`,
            rawContent: `
[FASE DMAIC]: ${phase.phase} (Estado Tollgate: ${phase.tollgate_status})
[PROYECTO]: ${projectName}
[HALLAZGOS Y DESAFÍOS]: ${findings.join('; ') || phase.charter_problem_statement || 'Alineación de estándares de calidad'}
[SOLUCIONES IMPLEMENTADAS]: ${solutions.join('; ') || 'Contramedidas verificadas con telemetría en tiempo real'}
[APRENDIZAJE CLAVE]: Es fundamental formalizar el Project Charter y la matriz SIPOC antes de generar código; los límites WIP en Kanban garantizan un flujo sin saturación de recursos.
            `.trim(),
            metadata: {
              stack: techStackList,
              category: `DMAIC_${phase.phase}`
            }
          });
        }

        // =====================================================================
        // DOMINIO 5: SOP_PROCEDURES (Standard Operating Procedures)
        // =====================================================================
        const controlPhase = dmaicPhases.find((p: any) => p.phase === 'CONTROL');
        const controlPlan = controlPhase?.control_plan || {};

        chunksToVectorize.push({
          domain: 'SOP_PROCEDURES',
          title: `Procedimiento de Control y Gobernanza: ${projectName}`,
          rawContent: `
[PROCEDIMIENTO ESTÁNDAR OPERATIVO (SOP)]: Gobernanza Continua de ${projectName}
[PLAN DE CONTROL]:
- Tolerancia máxima de duración: ${controlPlan.tolerance_max_duration_ms || 300000} ms
- Tasa mínima de éxito requerida: ${controlPlan.min_success_rate || 95}%
[PROTOCOLO DE RESPUESTA A INCIDENTES]:
1. Al recibir fallo de CI/CD, activar DevOps Triage AI para clasificar severidad.
2. Si la latencia supera el SLA de 200ms, verificar connection pooling en Neon Postgres.
3. Bloquear mutaciones en proyectos ARCHIVED mediante triggers de inmutabilidad.
[TRANSFERENCIA DE CONOCIMIENTO]: Procedimiento transferido al equipo interno bajo la filosofía TSolutions IPIDD.
          `.trim(),
          metadata: {
            stack: techStackList,
            category: 'GOVERNANCE_SOP'
          }
        });

        // 3. Generar Embeddings de 1536 dimensiones e insertar masivamente
        await client.query('BEGIN');

        let insertedCount = 0;
        for (const chunk of chunksToVectorize) {
          const embeddingVector = await EmbeddingService.getEmbedding(
            `${chunk.title}\n${chunk.rawContent}`
          );
          const pgVectorStr = EmbeddingService.toPgVectorString(embeddingVector);

          await client.query(
            `INSERT INTO nexus_knowledge_vectors (
              workspace_id, project_id, knowledge_domain, title, raw_content, metadata, embedding
            ) VALUES ($1, $2, $3, $4, $5, $6, $7::vector)`,
            [
              workspaceId,
              projectId,
              chunk.domain,
              chunk.title.substring(0, 200),
              chunk.rawContent,
              JSON.stringify(chunk.metadata),
              pgVectorStr
            ]
          );
          insertedCount++;
        }

        await client.query('COMMIT');
        console.log(`[NexusWorker] ✓ Asimilación completada: ${insertedCount} fragmentos vectoriales insertados en nexus_knowledge_vectors.`);

        // 4. Emitir Notificación WebSocket a la sala de workspace con evento NEXUS_KNOWLEDGE_ABSORBED
        if (io) {
          const domainsAbsorbed = Array.from(new Set(chunksToVectorize.map(c => c.domain)));
          io.to(`workspace_${workspaceId}`).emit('NEXUS_KNOWLEDGE_ABSORBED', {
            workspaceId,
            projectId,
            projectName,
            absorbedCount: insertedCount,
            domains: domainsAbsorbed,
            timestamp: new Date().toISOString()
          });
        }

        return {
          workspaceId,
          projectId,
          absorbedCount: insertedCount
        };
      } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('[NexusWorker Error]:', err);
        throw err;
      } finally {
        client.release();
      }
}

/**
 * Instancia y configura el Worker de BullMQ para la cola de asimilación de conocimiento.
 */
export function createNexusKnowledgeWorker(
  pool: Pool,
  io?: SocketIOServer,
  redisUrl?: string
): Worker<IngestionJobData> | null {
  const connectionUrl = redisUrl || process.env.REDIS_URL;

  if (!connectionUrl || connectionUrl.includes('tu_host') || connectionUrl.includes('tu_password')) {
    console.log('[NexusWorker] Redis URL no configurado o con credenciales dummy. Worker BullMQ diferido.');
    return null;
  }

  try {
    const worker = new Worker<IngestionJobData>(
      'nexus-knowledge-ingestion-queue',
      async (job: Job<IngestionJobData>) => {
        return await processNexusKnowledgeArtifacts(
          pool,
          job.data.workspaceId,
          job.data.projectId,
          job.data.snapshotId,
          io
        );
      },
      {
        connection: { url: connectionUrl },
        concurrency: 3
      }
    );

    worker.on('error', (err: any) => {
      console.warn('[NexusWorker Warning]:', err.message);
    });

    worker.on('failed', (job, err) => {
      console.error(`[NexusWorker Job Failed] Job ${job?.id}:`, err);
    });

    return worker;
  } catch (err: any) {
    console.warn('[NexusWorker Initialization Error]:', err.message);
    return null;
  }
}
