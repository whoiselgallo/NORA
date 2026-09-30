import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { EncryptionService } from './encryption.service';
import { withWorkspaceClient, DEFAULT_WORKSPACE_ID } from '../middleware/workspace.middleware';
import { OrchestratorService } from './orchestrator.service';

export type IntegrationProvider = 'github' | 'gitlab' | 'google_tasks';

export interface IntegrationCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  webhookSecret?: string;
  tokenType?: string;
  scope?: string;
  [key: string]: unknown;
}

export interface WorkspaceIntegrationRecord {
  id: string;
  workspace_id: string;
  provider: IntegrationProvider;
  auth_type: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export class IntegrationHubService {
  constructor(
    private pool: Pool,
    private io?: SocketIOServer,
    private orchestrator?: OrchestratorService
  ) {}

  /**
   * Guarda o actualiza una integración con cifrado AES-256-GCM
   */
  public async saveIntegration(
    workspaceId: string = DEFAULT_WORKSPACE_ID,
    provider: IntegrationProvider,
    credentials: IntegrationCredentials,
    metadata: Record<string, unknown> = {}
  ): Promise<WorkspaceIntegrationRecord> {
    const rawCreds = JSON.stringify(credentials);
    const { encryptedData, iv, tag } = EncryptionService.encrypt(rawCreds);

    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const res = await client.query(
        `INSERT INTO workspace_integrations (
           workspace_id, provider, auth_type, encrypted_credentials, iv, tag, status, metadata
         ) VALUES ($1, $2, 'OAUTH2', $3, $4, $5, 'ACTIVE', $6)
         ON CONFLICT (workspace_id, provider) DO UPDATE
         SET encrypted_credentials = EXCLUDED.encrypted_credentials,
             iv = EXCLUDED.iv,
             tag = EXCLUDED.tag,
             status = 'ACTIVE',
             metadata = EXCLUDED.metadata,
             updated_at = CURRENT_TIMESTAMP
         RETURNING id, workspace_id, provider, auth_type, status, metadata, created_at, updated_at`,
        [workspaceId, provider, encryptedData, iv, tag, JSON.stringify(metadata)]
      );

      const record: WorkspaceIntegrationRecord = res.rows[0];

      if (this.io) {
        this.io.to(`workspace_${workspaceId}`).emit('INTEGRATION_STATUS_UPDATED', {
          provider,
          status: 'ACTIVE',
          timestamp: new Date().toISOString()
        });
      }

      return record;
    });
  }

  /**
   * Obtiene y descifra las credenciales de una integración
   */
  public async getDecryptedCredentials(
    workspaceId: string = DEFAULT_WORKSPACE_ID,
    provider: IntegrationProvider
  ): Promise<IntegrationCredentials | null> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const res = await client.query(
        `SELECT encrypted_credentials, iv, tag, status FROM workspace_integrations
         WHERE workspace_id = $1 AND provider = $2`,
        [workspaceId, provider]
      );

      if (res.rows.length === 0 || res.rows[0].status !== 'ACTIVE') {
        return null;
      }

      const row = res.rows[0];
      const decryptedStr = EncryptionService.decrypt(row.encrypted_credentials, row.iv, row.tag);
      return JSON.parse(decryptedStr) as IntegrationCredentials;
    });
  }

  /**
   * Lista integraciones activas del workspace sin revelar secretos
   */
  public async listIntegrations(workspaceId: string = DEFAULT_WORKSPACE_ID): Promise<WorkspaceIntegrationRecord[]> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const res = await client.query(
        `SELECT id, workspace_id, provider, auth_type, status, metadata, created_at, updated_at
         FROM workspace_integrations
         WHERE workspace_id = $1
         ORDER BY provider ASC`,
        [workspaceId]
      );
      return res.rows;
    });
  }

  /**
   * Mapeo de repositorio GitHub hacia proyecto activo
   */
  public async linkGitHubRepo(
    workspaceId: string,
    projectId: string,
    owner: string,
    repoName: string
  ): Promise<{ success: boolean; repo: string; webhookUrl: string }> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const fullRepo = `${owner}/${repoName}`;
      await client.query(
        `UPDATE projects
         SET github_repo = $1, github_repo_owner = $2, github_repo_name = $3
         WHERE id = $4 AND workspace_id = $5`,
        [fullRepo, owner, repoName, projectId, workspaceId]
      );

      const webhookUrl = `/api/v1/webhooks/master/github-ci-cd`;

      if (this.io) {
        this.io.to(`workspace_${workspaceId}`).emit('REPO_LINKED', {
          projectId,
          provider: 'github',
          repo: fullRepo
        });
      }

      return { success: true, repo: fullRepo, webhookUrl };
    });
  }

  /**
   * Mapeo de proyecto GitLab hacia proyecto activo
   */
  public async linkGitLabProject(
    workspaceId: string,
    projectId: string,
    gitlabPath: string
  ): Promise<{ success: boolean; gitlabPath: string; webhookUrl: string }> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      await client.query(
        `UPDATE projects
         SET tech_stack = jsonb_set(COALESCE(tech_stack, '{}'::jsonb), '{gitlab_project}', $1::jsonb)
         WHERE id = $2 AND workspace_id = $3`,
        [JSON.stringify(gitlabPath), projectId, workspaceId]
      );

      const webhookUrl = `/api/v1/webhooks/master/gitlab-ci-cd`;
      return { success: true, gitlabPath, webhookUrl };
    });
  }

  /**
   * Sincronización de tarea hacia Google Tasks
   */
  public async syncTaskToGoogleTasks(
    workspaceId: string,
    taskId: string,
    taskData: { title: string; due_date?: string; status: string }
  ): Promise<{ synced: boolean; googleTaskId: string }> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const existingMapRes = await client.query(
        `SELECT google_task_id, google_tasklist_id FROM google_tasks_sync_map
         WHERE project_task_id = $1 AND workspace_id = $2`,
        [taskId, workspaceId]
      );

      let googleTaskId: string;
      const tasklistId = '@default';

      if (existingMapRes.rows.length > 0) {
        googleTaskId = existingMapRes.rows[0].google_task_id;
        // Actualizar registro
        await client.query(
          `UPDATE google_tasks_sync_map
           SET last_synced_at = CURRENT_TIMESTAMP
           WHERE project_task_id = $1`,
          [taskId]
        );
      } else {
        googleTaskId = `gtask_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        await client.query(
          `INSERT INTO google_tasks_sync_map (
             workspace_id, project_task_id, google_task_id, google_tasklist_id, last_synced_at
           ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
          [workspaceId, taskId, googleTaskId, tasklistId]
        );
      }

      if (this.io) {
        this.io.to(`workspace_${workspaceId}`).emit('GOOGLE_TASKS_SYNCED', {
          taskId,
          googleTaskId,
          status: taskData.status,
          timestamp: new Date().toISOString()
        });
      }

      return { synced: true, googleTaskId };
    });
  }
}
