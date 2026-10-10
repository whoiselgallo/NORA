import crypto from 'crypto';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { DiscordAlertsService } from './discordAlerts.service';

export interface WebhookDispatchJob {
  id: string;
  sourceDomain: string;
  targetUrl: string;
  payload: Record<string, any>;
  secretKey?: string;
  maxAttempts: number;
  currentAttempt: number;
  nextRetryAt: number;
  status: 'PENDING' | 'PROCESSING' | 'DELIVERED' | 'FAILED_RETRYING' | 'DEAD_LETTER';
  createdAt: string;
  lastError?: string;
  lastHttpCode?: number;
  lastLatencyMs?: number;
  workspaceId: string;
}

export interface WebhookDlqEntry {
  id: string;
  jobId: string;
  sourceDomain: string;
  targetUrl: string;
  payload: Record<string, any>;
  attempts: number;
  finalError: string;
  lastHttpCode?: number;
  failedAt: string;
  workspaceId: string;
}

/**
 * Servicio Central de Cola Asíncrona, Reintentos con Backoff Exponencial y DLQ
 * Cumple con estándares de confiabilidad de Stripe, Zapier y Svix.
 */
export class WebhookQueueService {
  private queue: Map<string, WebhookDispatchJob> = new Map();
  private dlq: Map<string, WebhookDlqEntry> = new Map();
  private isProcessing = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private pool: Pool,
    private io?: SocketIOServer
  ) {
    // Loop de procesamiento de cola en segundo plano cada 2 segundos
    this.timer = setInterval(() => this.processPendingQueue(), 2000);
    this.timer.unref();
  }

  /**
   * TS-WH-11: Generar firma criptográfica HMAC-SHA256 con timestamp
   * Formato: t={timestamp},v1={hmac_sha256_hex}
   */
  public static signPayload(payloadString: string, secretKey: string): { signatureHeader: string; timestamp: number } {
    const timestamp = Math.floor(Date.now() / 1000);
    const toSign = `${timestamp}.${payloadString}`;
    const hash = crypto.createHmac('sha256', secretKey).update(toSign).digest('hex');
    return {
      signatureHeader: `t=${timestamp},v1=${hash}`,
      timestamp
    };
  }

  /**
   * TS-WH-08: Encolar despacho asíncrono inmediato (desacopla el hilo del webhook)
   */
  public enqueue(
    sourceDomain: string,
    targetUrl: string,
    payload: Record<string, any>,
    workspaceId: string = '00000000-0000-0000-0000-000000000001',
    secretKey?: string
  ): WebhookDispatchJob {
    const jobId = `wh_job_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const job: WebhookDispatchJob = {
      id: jobId,
      sourceDomain,
      targetUrl,
      payload,
      secretKey,
      maxAttempts: 5,
      currentAttempt: 0,
      nextRetryAt: Date.now(), // Procesar de inmediato
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      workspaceId
    };

    this.queue.set(jobId, job);

    // Trigger inmediato fuera del hilo principal
    setImmediate(() => this.processPendingQueue());

    return job;
  }

  /**
   * Procesa los trabajos pendientes de la cola que ya cumplieron su tiempo de espera
   */
  private async processPendingQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const now = Date.now();
      const eligibleJobs = Array.from(this.queue.values()).filter(
        j => (j.status === 'PENDING' || j.status === 'FAILED_RETRYING') && now >= j.nextRetryAt
      );

      for (const job of eligibleJobs) {
        await this.executeJob(job);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Ejecuta el envío HTTP de un webhook individual
   */
  private async executeJob(job: WebhookDispatchJob): Promise<void> {
    job.status = 'PROCESSING';
    job.currentAttempt++;
    const startTime = Date.now();

    const bodyString = JSON.stringify(job.payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'TSolutions-Webhook-Dispatcher/2.0',
      'X-TSolutions-Delivery': job.id,
      'X-TSolutions-Attempt': String(job.currentAttempt)
    };

    if (job.secretKey) {
      const { signatureHeader } = WebhookQueueService.signPayload(bodyString, job.secretKey);
      headers['X-TSolutions-Signature'] = signatureHeader;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(job.targetUrl, {
        method: 'POST',
        headers,
        body: bodyString,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const latencyMs = Date.now() - startTime;
      job.lastLatencyMs = latencyMs;
      job.lastHttpCode = response.status;

      if (response.ok) {
        // ÉXITO: 2xx recibido
        job.status = 'DELIVERED';
        this.queue.delete(job.id);

        this.emitWebhookStatus(job, 'DELIVERED');
        await this.persistTelemetry(job, 'SUCCESS');
        return;
      }

      // Respuesta de error del receptor (4xx o 5xx)
      const errText = await response.text().catch(() => '');
      job.lastError = `HTTP ${response.status}: ${errText.substring(0, 300)}`;
      await this.handleFailedAttempt(job);
    } catch (err: any) {
      job.lastLatencyMs = Date.now() - startTime;
      job.lastError = err.message || 'Error de conexión o timeout';
      await this.handleFailedAttempt(job);
    }
  }

  /**
   * TS-WH-09 & TS-WH-10: Maneja reintentos con backoff exponencial o desvío a DLQ
   */
  private async handleFailedAttempt(job: WebhookDispatchJob): Promise<void> {
    if (job.currentAttempt < job.maxAttempts) {
      job.status = 'FAILED_RETRYING';
      // Backoff Exponencial con jitter: 2s, 8s, 32s, 128s
      const baseDelay = 2000;
      const exponentialDelay = baseDelay * Math.pow(4, job.currentAttempt - 1);
      const jitter = Math.floor(Math.random() * 1000);
      const delayMs = exponentialDelay + jitter;

      job.nextRetryAt = Date.now() + delayMs;

      this.emitWebhookStatus(job, 'RETRYING', delayMs);
      await this.persistTelemetry(job, 'RETRYING');
    } else {
      // Agotó los intentos máximos -> DESVIAR A DEAD LETTER QUEUE (DLQ)
      job.status = 'DEAD_LETTER';
      this.queue.delete(job.id);

      const dlqEntry: WebhookDlqEntry = {
        id: `dlq_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        jobId: job.id,
        sourceDomain: job.sourceDomain,
        targetUrl: job.targetUrl,
        payload: job.payload,
        attempts: job.currentAttempt,
        finalError: job.lastError || 'Intentos máximos agotados sin respuesta válida',
        lastHttpCode: job.lastHttpCode,
        failedAt: new Date().toISOString(),
        workspaceId: job.workspaceId
      };

      this.dlq.set(dlqEntry.id, dlqEntry);

      this.emitWebhookStatus(job, 'DEAD_LETTER');
      await this.persistTelemetry(job, 'DEAD_LETTER');

      // Notificar a las salas de administración vía WebSockets
      if (this.io) {
        this.io.to(`workspace_${job.workspaceId}`).emit('WEBHOOK_DLQ_ALERT', dlqEntry);
      }

      // Notificar a Discord / Slack ($0/mes)
      DiscordAlertsService.getInstance()
        .sendDlqAlert(dlqEntry)
        .catch(() => {});
    }
  }

  /**
   * Reintentar manualmente un trabajo de la DLQ (1-Click Replay desde DLQ)
   */
  public replayDlqEntry(dlqId: string): WebhookDispatchJob | null {
    const entry = this.dlq.get(dlqId);
    if (!entry) return null;

    this.dlq.delete(dlqId);
    return this.enqueue(entry.sourceDomain, entry.targetUrl, entry.payload, entry.workspaceId);
  }

  /**
   * Obtener métricas y estado en tiempo real de la cola y DLQ
   */
  public getStats() {
    return {
      active_jobs: this.queue.size,
      dlq_entries_count: this.dlq.size,
      pending_jobs: Array.from(this.queue.values()).map(j => ({
        id: j.id,
        targetUrl: j.targetUrl,
        attempt: `${j.currentAttempt}/${j.maxAttempts}`,
        status: j.status,
        nextRetryInSeconds: Math.max(0, Math.ceil((j.nextRetryAt - Date.now()) / 1000))
      })),
      dlq_items: Array.from(this.dlq.values()).slice(-20)
    };
  }

  private emitWebhookStatus(job: WebhookDispatchJob, event: string, nextDelayMs?: number): void {
    if (this.io) {
      this.io.to(`workspace_${job.workspaceId}`).emit('WEBHOOK_DISPATCH_TELEMETRY', {
        jobId: job.id,
        targetUrl: job.targetUrl,
        status: event,
        attempt: job.currentAttempt,
        maxAttempts: job.maxAttempts,
        httpCode: job.lastHttpCode,
        latencyMs: job.lastLatencyMs,
        nextRetryInSeconds: nextDelayMs ? Math.ceil(nextDelayMs / 1000) : 0,
        timestamp: new Date().toISOString()
      });
    }
  }

  private async persistTelemetry(job: WebhookDispatchJob, outcome: string): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO master_webhook_telemetry_logs (
          source_domain, subdomain_key, routing_key, event_type,
          workspace_id, payload, status, latency_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          job.sourceDomain,
          'dispatcher_queue',
          `DISPATCH_${outcome}`,
          job.payload.event || 'WEBHOOK_OUTBOUND',
          job.workspaceId,
          JSON.stringify({
            targetUrl: job.targetUrl,
            attempts: job.currentAttempt,
            error: job.lastError,
            code: job.lastHttpCode
          }),
          outcome,
          job.lastLatencyMs || 0
        ]
      );
    } catch {
      // Ignorar errores de BD para no afectar la cola
    }
  }
}
