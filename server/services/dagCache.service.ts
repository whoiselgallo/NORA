import Redis from 'ioredis';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { DEFAULT_WORKSPACE_ID, withWorkspaceClient } from '../middleware/workspace.middleware';

export interface WorkflowNodeItem {
  id: string;
  slug?: string;
  title: string;
  label?: string;
  description?: string;
  category: string;
  status: 'RED' | 'GREEN';
  is_automated_github: boolean;
  step_order?: number;
  position_x: number;
  position_y: number;
  completed_at?: string | null;
}

export interface WorkflowEdgeItem {
  id: string;
  source_node_id: string;
  target_node_id: string;
}

export interface ProjectWorkflowDAG {
  workflow: {
    id: string;
    project_id: string;
    name: string;
    created_at: string;
  };
  nodes: WorkflowNodeItem[];
  edges: WorkflowEdgeItem[];
  cached_at?: string;
  workspace_id?: string;
}

export class DagCacheService {
  private redis: Redis | null = null;
  private isConnected: boolean = false;
  private memoryCache: Map<string, { data: string; expiresAt: number }> = new Map();
  private readonly defaultTtlSeconds: number = 86400; // 24 horas

  constructor(redisUrl?: string) {
    const url = redisUrl || process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL;
    
    if (url) {
      try {
        const isTls = url.startsWith('rediss://');
        this.redis = new Redis(url, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          connectTimeout: 2500,
          enableOfflineQueue: false,
          tls: isTls ? { rejectUnauthorized: false } : undefined,
          retryStrategy: (times) => {
            if (times > 3) return null;
            return Math.min(times * 500, 2000);
          }
        });

        this.redis.on('connect', () => {
          this.isConnected = true;
          console.log('✓ DagCacheService connected to Redis / Upstash.');
        });

        this.redis.on('error', () => {
          this.isConnected = false;
        });

        this.redis.connect().catch(() => {
          this.isConnected = false;
        });
      } catch {
        this.isConnected = false;
        this.redis = null;
      }
    } else {
      // Sin URL de Redis configurada: Operación 100% en memoria ($0/mes, Zero-Cost)
      this.isConnected = false;
      this.redis = null;
    }
  }

  /**
   * Namespaciado estricto multi-tenant de llaves en Redis con prefijo ws:WORKSPACE_ID:
   */
  private getKey(projectId: string, workspaceId: string = DEFAULT_WORKSPACE_ID): string {
    return `ws:${workspaceId}:project:${projectId}:dag`;
  }

  /**
   * Consulta la caché en memoria del grafo DAG (Redis/Upstash con fallback a proceso)
   */
  public async getDag(
    projectId: string,
    workspaceId: string = DEFAULT_WORKSPACE_ID
  ): Promise<ProjectWorkflowDAG | null> {
    const key = this.getKey(projectId, workspaceId);

    // 1. Probar Redis / Upstash si está conectado
    if (this.redis && this.isConnected) {
      try {
        const data = await this.redis.get(key);
        if (data) {
          return JSON.parse(data) as ProjectWorkflowDAG;
        }
      } catch {
        // Fallback a memoria
      }
    }

    // 2. Fallback a caché en memoria de proceso ($0/mes, Zero-Cost)
    const memEntry = this.memoryCache.get(key);
    if (memEntry) {
      if (Date.now() < memEntry.expiresAt) {
        try {
          return JSON.parse(memEntry.data) as ProjectWorkflowDAG;
        } catch {
          this.memoryCache.delete(key);
        }
      } else {
        this.memoryCache.delete(key);
      }
    }

    return null;
  }

  /**
   * Guarda la topología del grafo DAG en Redis/Upstash y memoria local con TTL
   */
  public async setDag(
    projectId: string,
    dag: ProjectWorkflowDAG,
    workspaceId: string = DEFAULT_WORKSPACE_ID,
    ttlSeconds: number = this.defaultTtlSeconds
  ): Promise<void> {
    const key = this.getKey(projectId, workspaceId);
    const payload = JSON.stringify({
      ...dag,
      workspace_id: workspaceId,
      cached_at: new Date().toISOString()
    });

    // Guardar en memoria siempre como fallback instantáneo (0ms latency)
    this.memoryCache.set(key, {
      data: payload,
      expiresAt: Date.now() + ttlSeconds * 1000
    });

    // Persistir en Redis / Upstash si está conectado
    if (this.redis && this.isConnected) {
      try {
        await this.redis.set(key, payload, 'EX', ttlSeconds);
      } catch {
        // Degradación elegante
      }
    }
  }

  /**
   * Borrado atómico de la clave namespaciada en Redis y memoria local
   */
  public async invalidateDag(
    projectId: string,
    workspaceId: string = DEFAULT_WORKSPACE_ID
  ): Promise<boolean> {
    const key = this.getKey(projectId, workspaceId);
    const deletedMem = this.memoryCache.delete(key);

    if (this.redis && this.isConnected) {
      try {
        const deleted = await this.redis.del(key);
        return deleted > 0 || deletedMem;
      } catch {
        return deletedMem;
      }
    }

    return deletedMem;
  }

  public async invalidateProjectDag(
    projectId: string,
    workspaceId: string = DEFAULT_WORKSPACE_ID
  ): Promise<boolean> {
    return this.invalidateDag(projectId, workspaceId);
  }

  /**
   * Flujo de lectura optimizado con RLS respetando app.current_workspace_id
   */
  public async getOrFetchDag(
    pool: Pool,
    projectId: string,
    workspaceId: string = DEFAULT_WORKSPACE_ID
  ): Promise<{ data: ProjectWorkflowDAG; cached: boolean }> {
    // 1. Intentar lectura de caché en Redis
    const cached = await this.getDag(projectId, workspaceId);
    if (cached) {
      return { data: cached, cached: true };
    }

    // 2. Cache miss: Consultar base de datos relacional Neon aplicando RLS
    return await withWorkspaceClient(pool, workspaceId, async (client) => {
      const workflowRes = await client.query(
        `SELECT pw.* FROM project_workflows pw
         JOIN projects p ON pw.project_id = p.id
         WHERE pw.project_id = $1 AND p.workspace_id = $2
         LIMIT 1`,
        [projectId, workspaceId]
      );

      if (workflowRes.rows.length === 0) {
        throw new Error(`Workflow not found for project ${projectId} in workspace ${workspaceId}`);
      }

      const workflow = workflowRes.rows[0];

      const nodesRes = await client.query(
        `SELECT id, slug, title, label, description, category, status, is_automated_github,
                step_order, position_x, position_y, completed_at
         FROM workflow_nodes
         WHERE workflow_id = $1
         ORDER BY position_x ASC, step_order ASC`,
        [workflow.id]
      );

      const edgesRes = await client.query(
        `SELECT id, source_node_id, target_node_id
         FROM workflow_edges
         WHERE workflow_id = $1`,
        [workflow.id]
      );

      const dagData: ProjectWorkflowDAG = {
        workflow,
        nodes: nodesRes.rows,
        edges: edgesRes.rows,
        workspace_id: workspaceId
      };

      // 3. Persistir en Redis con TTL de 24 horas bajo la clave ws:WORKSPACE_ID:project:PROJECT_ID:dag
      await this.setDag(projectId, dagData, workspaceId, this.defaultTtlSeconds);

      return { data: dagData, cached: false };
    });
  }

  /**
   * Asegura que la invalidación atómica de Redis ocurra inmediatamente ANTES
   * de la emisión por WebSocket a las salas workspace_WORKSPACE_ID y project:PROJECT_ID.
   */
  public async invalidateAndEmitTransition(
    projectId: string,
    io: SocketIOServer,
    transition: {
      nodeId: string;
      slug?: string;
      title?: string;
      status: 'RED' | 'GREEN';
      reason: string;
    },
    workspaceId: string = DEFAULT_WORKSPACE_ID
  ): Promise<void> {
    await this.invalidateDag(projectId, workspaceId);

    // Notificar tanto a la sala de workspace como de proyecto
    io.to(`workspace_${workspaceId}`).emit('WORKFLOW_NODE_TRANSITION', {
      ...transition,
      projectId,
      workspaceId
    });
    io.to(`project:${projectId}`).emit('WORKFLOW_NODE_TRANSITION', transition);
  }

  public async close(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        this.redis.disconnect();
      }
    }
  }
}
