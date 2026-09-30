import Redis from 'ioredis';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';

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
}

export class DagCacheService {
  private redis: Redis | null = null;
  private isConnected: boolean = false;
  private readonly defaultTtlSeconds: number = 86400; // 24 horas

  constructor(redisUrl?: string) {
    const url = redisUrl || process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    try {
      this.redis = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        enableOfflineQueue: false,
        retryStrategy: (times) => {
          if (times > 3) return null; // Detener reintentos ruidosos si no hay Redis local
          return Math.min(times * 500, 2000);
        }
      });

      this.redis.on('connect', () => {
        this.isConnected = true;
      });

      this.redis.on('error', (err) => {
        this.isConnected = false;
      });

      // Conexión no bloqueante
      this.redis.connect().catch(() => {
        this.isConnected = false;
      });
    } catch (err: any) {
      this.isConnected = false;
      this.redis = null;
    }
  }

  private getKey(projectId: string): string {
    return `project:${projectId}:dag`;
  }

  /**
   * Consulta la caché en memoria del grafo DAG en Redis bajo la clave project:PROJECT_ID:dag
   */
  public async getDag(projectId: string): Promise<ProjectWorkflowDAG | null> {
    if (!this.redis || !this.isConnected) return null;

    try {
      const data = await this.redis.get(this.getKey(projectId));
      if (!data) return null;
      return JSON.parse(data) as ProjectWorkflowDAG;
    } catch (err) {
      return null;
    }
  }

  /**
   * Guarda la topología del grafo DAG en Redis con TTL de 24 horas (86400s)
   */
  public async setDag(
    projectId: string,
    dag: ProjectWorkflowDAG,
    ttlSeconds: number = this.defaultTtlSeconds
  ): Promise<void> {
    if (!this.redis || !this.isConnected) return;

    try {
      const payload = JSON.stringify({
        ...dag,
        cached_at: new Date().toISOString()
      });
      await this.redis.set(this.getKey(projectId), payload, 'EX', ttlSeconds);
    } catch (err) {
      // Degradación elegante si falla Redis
    }
  }

  /**
   * Borrado atómico de la clave project:PROJECT_ID:dag en Redis.
   * Se ejecuta única y exclusivamente cuando ocurre un evento WORKFLOW_NODE_TRANSITION
   * o cuando se altere la estructura de nodos y aristas del grafo.
   */
  public async invalidateDag(projectId: string): Promise<boolean> {
    if (!this.redis || !this.isConnected) return false;

    try {
      const deleted = await this.redis.del(this.getKey(projectId));
      return deleted > 0;
    } catch (err) {
      return false;
    }
  }

  /**
   * Flujo de lectura optimizado:
   * 1. Consulta Redis (cache hit -> retorno inmediato).
   * 2. Cache miss -> Consulta Neon PostgreSQL, persiste en Redis con TTL 24h y retorna.
   */
  public async getOrFetchDag(
    pool: Pool,
    projectId: string
  ): Promise<{ data: ProjectWorkflowDAG; cached: boolean }> {
    // 1. Intentar lectura de caché
    const cached = await this.getDag(projectId);
    if (cached) {
      return { data: cached, cached: true };
    }

    // 2. Cache miss: Consultar base de datos relacional Neon
    const workflowRes = await pool.query(
      `SELECT * FROM project_workflows WHERE project_id = $1 LIMIT 1`,
      [projectId]
    );

    if (workflowRes.rows.length === 0) {
      throw new Error(`Workflow not found for project ${projectId}`);
    }

    const workflow = workflowRes.rows[0];

    const nodesRes = await pool.query(
      `SELECT id, slug, title, label, description, category, status, is_automated_github,
              step_order, position_x, position_y, completed_at
       FROM workflow_nodes
       WHERE workflow_id = $1
       ORDER BY position_x ASC, step_order ASC`,
      [workflow.id]
    );

    const edgesRes = await pool.query(
      `SELECT id, source_node_id, target_node_id
       FROM workflow_edges
       WHERE workflow_id = $1`,
      [workflow.id]
    );

    const dagData: ProjectWorkflowDAG = {
      workflow,
      nodes: nodesRes.rows,
      edges: edgesRes.rows
    };

    // 3. Persistir en Redis con TTL de 24 horas
    await this.setDag(projectId, dagData, this.defaultTtlSeconds);

    return { data: dagData, cached: false };
  }

  /**
   * Asegura que la invalidación atómica de Redis ocurra inmediatamente ANTES
   * de la emisión por WebSocket, garantizando consistencia estricta en los clientes.
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
    }
  ): Promise<void> {
    // 1. Borrado atómico de la clave en Redis
    await this.invalidateDag(projectId);

    // 2. Notificación en tiempo real a la sala del proyecto
    io.to(`project:${projectId}`).emit('WORKFLOW_NODE_TRANSITION', transition);
  }

  /**
   * Invalida la caché del grafo e informa a la sala del proyecto sobre la actualización
   * de topología completa (nodos y aristas agregados o reconfigurados).
   */
  public async invalidateAndEmitTopologyUpdate(
    projectId: string,
    io: SocketIOServer
  ): Promise<void> {
    await this.invalidateDag(projectId);
    io.to(`project:${projectId}`).emit('WORKFLOW_DAG_UPDATED', {
      projectId,
      invalidatedAt: new Date().toISOString()
    });
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
