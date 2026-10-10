import { Request, Response, NextFunction } from 'express';

export interface SloMetrics {
  totalRequests: number;
  successfulRequests: number; // 2xx, 3xx, 4xx (client errors do not count against server availability SLO)
  serverErrorRequests: number; // 5xx
  availabilityRatio: number;
  latencySamples: number[];
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  uptimeSeconds: number;
  errorBudgetRemainingPercent: number; // Based on 99.9% target
}

const startTimeGlobal = Date.now();
let totalRequestsCounter = 0;
let serverErrorCounter = 0;
const latencySamplesBuffer: number[] = [];
const MAX_SAMPLES = 2000;

/**
 * TS-WH-META5: Middleware de Logs Estructurados para Google Cloud Logging
 * y Rastreo Distribuido con Cloud Trace.
 */
export function createStructuredLogger(projectId: string = process.env.GCP_PROJECT_ID || 'tsolutions-cloud-run') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = process.hrtime();
    const requestReceivedAt = new Date().toISOString();

    // Extraer Cloud Trace ID de x-cloud-trace-context (FORMATO: TRACE_ID/SPAN_ID;o=TRACE_TRUE)
    const traceHeader = (req.headers['x-cloud-trace-context'] as string) || '';
    const traceparent = (req.headers['traceparent'] as string) || '';

    let traceId = '';
    let spanId = '';

    if (traceHeader) {
      const parts = traceHeader.split(';')[0].split('/');
      traceId = parts[0];
      spanId = parts[1] || '';
    } else if (traceparent) {
      // Formato W3C: version-traceId-spanId-traceFlags
      const parts = traceparent.split('-');
      if (parts.length >= 3) {
        traceId = parts[1];
        spanId = parts[2];
      }
    }

    // Interceptar finalización de la respuesta HTTP
    res.on('finish', () => {
      const diff = process.hrtime(startTime);
      const latencySeconds = diff[0] + diff[1] / 1e9;
      const latencyMs = Math.round(latencySeconds * 1000);

      totalRequestsCounter++;
      if (res.statusCode >= 500) {
        serverErrorCounter++;
      }

      if (latencySamplesBuffer.length >= MAX_SAMPLES) {
        latencySamplesBuffer.shift();
      }
      latencySamplesBuffer.push(latencyMs);

      // Determinar severidad según código de respuesta
      let severity = 'INFO';
      if (res.statusCode >= 500) {
        severity = 'ERROR';
      } else if (res.statusCode >= 400) {
        severity = 'WARNING';
      }

      // Log Estructurado compatible nativamente con Cloud Logging de Google Cloud
      const logEntry: Record<string, any> = {
        severity,
        time: requestReceivedAt,
        message: `${req.method} ${req.originalUrl || req.url} ${res.statusCode} in ${latencyMs}ms`,
        httpRequest: {
          requestMethod: req.method,
          requestUrl: req.originalUrl || req.url,
          status: res.statusCode,
          userAgent: req.headers['user-agent'] || '',
          remoteIp: req.ip || req.socket.remoteAddress || '',
          latency: `${latencySeconds.toFixed(4)}s`
        }
      };

      if (traceId) {
        logEntry['logging.googleapis.com/trace'] = `projects/${projectId}/traces/${traceId}`;
      }
      if (spanId) {
        logEntry['logging.googleapis.com/spanId'] = spanId;
      }

      // Imprimir JSON en una sola línea para ingesta limpia por Google Cloud Logging Agent
      if (process.env.NODE_ENV === 'production' || process.env.STRUCTURED_LOGGING === 'true') {
        console.log(JSON.stringify(logEntry));
      } else {
        const statusColor = res.statusCode >= 500 ? '\x1b[31m' : res.statusCode >= 400 ? '\x1b[33m' : '\x1b[32m';
        console.log(`[${severity}] ${req.method} ${req.originalUrl || req.url} ${statusColor}${res.statusCode}\x1b[0m ${latencyMs}ms`);
      }
    });

    next();
  };
}

/**
 * Calcula las métricas de SLI y estado de SLO en tiempo real
 */
export function getSloMetricsSnapshot(): SloMetrics {
  const total = totalRequestsCounter;
  const errors = serverErrorCounter;
  const success = total - errors;
  const availabilityRatio = total === 0 ? 1.0 : success / total;

  // Cálculo de percentiles
  const sorted = [...latencySamplesBuffer].sort((a, b) => a - b);
  const p50 = sorted.length ? sorted[Math.floor(sorted.length * 0.5)] : 0;
  const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
  const p99 = sorted.length ? sorted[Math.floor(sorted.length * 0.99)] : 0;

  // Error budget para SLO 99.9% = (1 - 0.999) = 0.001 de tasa de error permitida
  const targetAvailability = 0.999;
  const allowedErrorRate = 1 - targetAvailability;
  const currentErrorRate = total === 0 ? 0 : errors / total;
  const errorBudgetRemainingPercent = Math.max(0, Math.min(100, Math.round((1 - (currentErrorRate / allowedErrorRate)) * 100)));

  return {
    totalRequests: total,
    successfulRequests: success,
    serverErrorRequests: errors,
    availabilityRatio: parseFloat(availabilityRatio.toFixed(5)),
    latencySamples: sorted.slice(-10),
    p50Ms: p50,
    p95Ms: p95,
    p99Ms: p99,
    uptimeSeconds: Math.floor((Date.now() - startTimeGlobal) / 1000),
    errorBudgetRemainingPercent
  };
}
