import { Request, Response } from 'express';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { DagCacheService } from '../services/dagCache.service';
import { DmaicService } from '../services/dmaic.service';
import { OrchestratorService } from '../services/orchestrator.service';
import { CampaignDispatcherService } from '../services/campaignDispatcher.service';
import { DEFAULT_WORKSPACE_ID } from '../middleware/workspace.middleware';

export class MasterWebhookHandler {
  constructor(
    private pool: Pool,
    private io: SocketIOServer,
    private dagCache: DagCacheService,
    private dmaicService?: DmaicService,
    private orchestrator?: OrchestratorService,
    private dispatcher?: CampaignDispatcherService
  ) {}

  public handleMasterWebhook = async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    const { routingKey } = req.params;
    const payload = req.body;

    if (!payload || !payload.event) {
      res.status(400).json({ error: 'Missing webhook event payload' });
      return;
    }

    const client = await this.pool.connect();
    try {
      // 1. MANEJO DE ALERTA DE CALENDARIO MAESTRO
      if (payload.event === 'CALENDAR_EVENT_ALERT') {
        const { eventId, title, dueDate, priority, workspaceId, projectId, isOverdue } = payload;
        const wsId = workspaceId || DEFAULT_WORKSPACE_ID;

        // Actualizar alert_triggered = true
        if (eventId) {
          await client.query(
            `UPDATE calendar_events
             SET alert_triggered = true, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [eventId]
          );
        }

        // Registrar telemetría del hito
        if (projectId) {
          await client.query(
            `INSERT INTO github_telemetry_events (
              workspace_id, project_id, event_type, event_action, conclusion,
              latency_ms, metadata, raw_payload
            ) VALUES ($1, $2, 'CALENDAR_ALERT', 'DISPATCH', $3, $4, $5, $6)`,
            [
              wsId,
              projectId,
              isOverdue ? 'OVERDUE' : 'UPCOMING',
              Date.now() - startTime,
              JSON.stringify({ title, dueDate, priority }),
              JSON.stringify(payload)
            ]
          );
        }

        // Propagar alerta por WebSocket a las salas de workspace y proyecto
        const alertData = {
          eventId,
          title,
          dueDate,
          priority: priority || 'MEDIUM',
          isOverdue: Boolean(isOverdue),
          workspaceId: wsId,
          projectId,
          timestamp: new Date().toISOString()
        };

        this.io.to(`workspace_${wsId}`).emit('CALENDAR_ALERT', alertData);
        if (projectId) {
          this.io.to(`project:${projectId}`).emit('CALENDAR_ALERT', alertData);
        }

        if (this.orchestrator) {
          await this.orchestrator.emitEvent({
            event_type: 'CALENDAR_ALERT',
            workspace_id: wsId,
            project_id: projectId,
            payload: alertData,
            timestamp: new Date().toISOString()
          });
        }

        res.status(200).json({
          status: 'PROCESSED',
          event: 'CALENDAR_EVENT_ALERT',
          routingKey,
          alertTriggered: true,
          latencyMs: Date.now() - startTime
        });
        return;
      }

      // 2. MANEJO DE TELEMETRÍA DE CI/CD & CIERRE DE BUCLE CON DAG & DMAIC
      if (payload.event === 'CI_CD_EXECUTION' || payload.event === 'workflow_run') {
        const {
          commit_sha,
          branch,
          author,
          workflow_status,
          phases_detail,
          timestamp,
          projectId: providedProjectId,
          workspaceId: providedWsId
        } = payload;

        let projectId = providedProjectId;
        let wsId = providedWsId || DEFAULT_WORKSPACE_ID;

        // Si no se proporcionó projectId, buscarlo por repositorio o workspace
        if (!projectId) {
          const prjRes = await client.query(`SELECT id, workspace_id FROM projects LIMIT 1`);
          if (prjRes.rows.length > 0) {
            projectId = prjRes.rows[0].id;
            wsId = prjRes.rows[0].workspace_id || wsId;
          }
        }

        const isSuccess = workflow_status === 'success';
        const executionDurationMs = Date.now() - startTime;

        if (isSuccess && projectId) {
          // Localizar nodos técnicos vinculados a CI/CD, QA y Despliegue con status RED y pasarlos a GREEN
          const updateNodesRes = await client.query(
            `UPDATE workflow_nodes
             SET status = 'GREEN',
                 completed_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE workflow_id IN (SELECT id FROM project_workflows WHERE project_id = $1)
               AND (category IN ('devops', 'qa', 'infra') OR is_automated_github = true)
               AND status = 'RED'
             RETURNING id, slug, title, category`,
            [projectId]
          );

          // Invalidar clave de caché del grafo en Redis
          await this.dagCache.invalidateProjectDag(projectId, wsId);

          // Emitir transición por WebSocket a las salas
          for (const node of updateNodesRes.rows) {
            this.io.to(`workspace_${wsId}`).emit('WORKFLOW_NODE_TRANSITION', {
              nodeId: node.id,
              slug: node.slug,
              title: node.title,
              status: 'GREEN',
              reason: 'CI_CD_EXECUTION_SUCCESS'
            });
            this.io.to(`project:${projectId}`).emit('WORKFLOW_NODE_TRANSITION', {
              nodeId: node.id,
              slug: node.slug,
              title: node.title,
              status: 'GREEN',
              reason: 'CI_CD_EXECUTION_SUCCESS'
            });
          }

          // Verificar si TODOS los nodos del proyecto pasaron a GREEN (Release Completo)
          const allNodesRes = await client.query(
            `SELECT status FROM workflow_nodes 
             WHERE workflow_id IN (SELECT id FROM project_workflows WHERE project_id = $1)`,
            [projectId]
          );
          const allGreen = allNodesRes.rows.length > 0 && allNodesRes.rows.every(n => n.status === 'GREEN');

          if (allGreen) {
            // Desbloquear y activar campañas de marketing vinculadas
            const campRes = await client.query(
              `UPDATE marketing_campaigns
               SET status = 'PROCESSING', is_blocked = false
               WHERE project_id = $1 AND (status = 'DRAFT' OR is_blocked = true)
               RETURNING id`,
              [projectId]
            );

            if (this.dispatcher && campRes.rows.length > 0) {
              for (const camp of campRes.rows) {
                await this.dispatcher.dispatchCampaign(camp.id, 'https://app.tsolutions-ipidd.com').catch(e => {
                  console.warn('[MasterWebhook] Campaign auto-dispatch error:', e.message);
                });
              }
            }

            if (this.orchestrator) {
              await this.orchestrator.emitEvent({
                event_type: 'DEPLOY_GREEN_REACHED',
                workspace_id: wsId,
                project_id: projectId,
                payload: {
                  status: 'GREEN',
                  totalNodes: allNodesRes.rows.length,
                  campaignsActivated: campRes.rows.length,
                  timestamp: new Date().toISOString()
                },
                timestamp: new Date().toISOString()
              });
            }
          }
        } else if (!isSuccess && projectId) {
          // Si falló, emitir alerta crítica detallando la fase exacta donde falló
          const failureStage = phases_detail?.find((p: any) => p.status === 'failure')?.name || 'pipeline';
          const alertPayload = {
            projectId,
            workspaceId: wsId,
            commit_sha,
            branch,
            author,
            failureStage,
            workflow_status: 'failure',
            timestamp: timestamp || new Date().toISOString()
          };

          this.io.to(`workspace_${wsId}`).emit('CI_CD_FAILURE_ALERT', alertPayload);
          this.io.to(`project:${projectId}`).emit('CI_CD_FAILURE_ALERT', alertPayload);

          // Verificar si hay 3 fallos consecutivos para disparar bucle OPEX
          const recentFailuresRes = await client.query(
            `SELECT conclusion FROM github_telemetry_events 
             WHERE project_id = $1 AND workspace_id = $2
             ORDER BY created_at DESC LIMIT 2`,
            [projectId, wsId]
          );
          const previousFailures = recentFailuresRes.rows.filter(r => r.conclusion === 'failure').length;
          const consecutiveFailures = 1 + previousFailures;

          if (consecutiveFailures >= 3 && this.dmaicService) {
            await this.dmaicService.triggerCausalAnalysisDraft(wsId, projectId, {
              title: `Análisis Causal: ${consecutiveFailures} Fallos Consecutivos CI/CD`,
              problemStatement: `Pipeline de CI/CD falló consecutivamente en la rama '${branch || 'main'}' (etapa: ${failureStage}).`,
              suspectedCategory: 'METHODS',
              commit_sha: commit_sha || undefined
            });

            if (this.orchestrator) {
              await this.orchestrator.emitEvent({
                event_type: 'CI_CD_CONSECUTIVE_FAILURES',
                workspace_id: wsId,
                project_id: projectId,
                payload: {
                  consecutiveFailures,
                  failureStage,
                  commit_sha
                },
                timestamp: new Date().toISOString()
              });
            }
          }
        }

        // Registrar en github_telemetry_events para alimentar el histórico
        if (projectId) {
          await client.query(
            `INSERT INTO github_telemetry_events (
              workspace_id, project_id, event_type, commit_sha, branch, author,
              conclusion, latency_ms, metadata, raw_payload
            ) VALUES ($1, $2, 'CI_CD_EXECUTION', $3, $4, $5, $6, $7, $8, $9)`,
            [
              wsId,
              projectId,
              commit_sha || null,
              branch || 'main',
              author || 'CI-Runner',
              workflow_status,
              executionDurationMs,
              JSON.stringify({ phases_detail }),
              JSON.stringify(payload)
            ]
          );

          // 5. Ingesta hacia la fase CONTROL del DMAIC
          if (this.dmaicService) {
            await this.dmaicService.ingestControlTelemetry(wsId, projectId, {
              duration_ms: executionDurationMs,
              conclusion: workflow_status,
              commit_sha: commit_sha || 'head',
              branch: branch || 'main'
            }).catch(e => {
              console.warn('[MasterWebhook] DMAIC control telemetry error:', e.message);
            });
          }

          if (this.orchestrator) {
            await this.orchestrator.emitEvent({
              event_type: 'CI_CD_TELEMETRY_INGESTED',
              workspace_id: wsId,
              project_id: projectId,
              payload: {
                workflow_status,
                commit_sha,
                branch,
                durationMs: executionDurationMs
              },
              timestamp: new Date().toISOString()
            });
          }
        }

        res.status(200).json({
          status: 'PROCESSED',
          event: 'CI_CD_EXECUTION',
          workflow_status,
          latencyMs: executionDurationMs
        });
        return;
      }

      // Evento genérico del Webhook Master
      res.status(200).json({
        status: 'ACKNOWLEDGED',
        routingKey,
        event: payload.event,
        latencyMs: Date.now() - startTime
      });
    } catch (err: unknown) {
      res.status(500).json({ error: `Webhook Master processing error: ${(err as Error).message}` });
    } finally {
      client.release();
    }
  };
}
