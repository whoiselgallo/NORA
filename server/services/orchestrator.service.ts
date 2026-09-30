import Redis from 'ioredis';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { DEFAULT_WORKSPACE_ID } from '../middleware/workspace.middleware';

export interface OrchestratorEvent<T = unknown> {
  event_type: string;
  workspace_id: string;
  project_id?: string;
  entity_id?: string;
  payload: T;
  timestamp: string;
}

export type EventHandler<T = unknown> = (event: OrchestratorEvent<T>) => Promise<void> | void;

export class OrchestratorService {
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private eventHandlers: Map<string, Array<EventHandler<unknown>>> = new Map();
  private isRedisConnected = false;

  constructor(
    private pool: Pool,
    private io?: SocketIOServer,
    redisUrl?: string
  ) {
    const url = redisUrl || process.env.REDIS_URL;
    if (url) {
      try {
        this.pubClient = new Redis(url, {
          retryStrategy: () => null, // No bloquear en fallback
          maxRetriesPerRequest: 1,
          lazyConnect: true
        });
        this.subClient = new Redis(url, {
          retryStrategy: () => null,
          maxRetriesPerRequest: 1,
          lazyConnect: true
        });

        this.pubClient.on('error', () => { this.isRedisConnected = false; });
        this.subClient.on('error', () => { this.isRedisConnected = false; });

        this.pubClient.connect().then(() => {
          this.isRedisConnected = true;
          this.setupSubscriber();
        }).catch(() => {
          this.isRedisConnected = false;
        });
      } catch {
        this.isRedisConnected = false;
      }
    }
  }

  private setupSubscriber(): void {
    if (!this.subClient) return;
    this.subClient.psubscribe('ws:*:events', (err) => {
      if (err) console.warn('[Orchestrator] Redis psubscribe error:', err.message);
    });

    this.subClient.on('pmessage', (_pattern, channel, message) => {
      try {
        const event = JSON.parse(message) as OrchestratorEvent;
        this.dispatchInternal(event, false); // Ya viene de Redis
      } catch (err) {
        console.error('[Orchestrator] Error parsing Redis event:', err);
      }
    });
  }

  /**
   * Emite un evento unificado bajo el canal ws:WORKSPACE_ID:events
   */
  public async emitEvent<T = unknown>(event: OrchestratorEvent<T>): Promise<void> {
    const workspaceId = event.workspace_id || DEFAULT_WORKSPACE_ID;
    const channel = `ws:${workspaceId}:events`;
    const payloadStr = JSON.stringify(event);

    // 1. Publicar en Redis Pub/Sub si está conectado
    if (this.isRedisConnected && this.pubClient) {
      try {
        await this.pubClient.publish(channel, payloadStr);
      } catch (err: unknown) {
        console.warn('[Orchestrator] Fallback to in-memory emit:', (err as Error).message);
      }
    }

    // 2. Despachar a nivel local y emitir vía WebSockets
    await this.dispatchInternal(event, true);
  }

  /**
   * Registra un manejador para un tipo específico de evento en el bus
   */
  public on<T = unknown>(eventType: string, handler: EventHandler<T>): void {
    const existing = this.eventHandlers.get(eventType) || [];
    existing.push(handler as EventHandler<unknown>);
    this.eventHandlers.set(eventType, existing);
  }

  /**
   * Despacha internamente el evento a los observadores registrados y WebSocket
   */
  private async dispatchInternal(event: OrchestratorEvent, emitWebSocket: boolean): Promise<void> {
    // A. Notificar vía WebSocket a las salas pertinentes
    if (emitWebSocket && this.io) {
      const wsRoom = `workspace_${event.workspace_id}`;
      this.io.to(wsRoom).emit(event.event_type, event);

      if (event.project_id) {
        this.io.to(`project:${event.project_id}`).emit(event.event_type, event);
      }
    }

    // B. Ejecutar suscriptores de lógica de negocio
    const handlers = this.eventHandlers.get(event.event_type) || [];
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (err) {
        console.error(`[Orchestrator] Handler error for ${event.event_type}:`, err);
      }
    }
  }

  public async close(): Promise<void> {
    if (this.pubClient) {
      await this.pubClient.quit().catch(() => {});
    }
    if (this.subClient) {
      await this.subClient.quit().catch(() => {});
    }
  }
}
