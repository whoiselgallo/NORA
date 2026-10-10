import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

/**
 * TS-WH-12: Rate Limiting Middleware para Webhooks de TSolutions
 * Protege contra saturación y ataques de denegación de servicio (DoS).
 * Inyecta cabeceras estándar RFC: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset.
 */
export function createWebhookRateLimiter(options: {
  windowMs?: number; // Ventana de tiempo (default: 60,000 ms = 1 min)
  maxRequests?: number; // Máximo de peticiones por ventana (default: 120)
} = {}) {
  const windowMs = options.windowMs || 60 * 1000;
  const maxRequests = options.maxRequests || 120;

  // Tarea de limpieza periódica para no acumular memoria
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      if (now > record.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }, windowMs * 2).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const workspaceId = req.workspaceId || 'global';
    const clientKey = `${workspaceId}:${ip}`;

    const now = Date.now();
    let record = rateLimitStore.get(clientKey);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs
      };
      rateLimitStore.set(clientKey, record);
    } else {
      record.count++;
    }

    const remaining = Math.max(0, maxRequests - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (record.count > maxRequests) {
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Límite de peticiones excedido. Máximo ${maxRequests} peticiones por minuto. Intente de nuevo en ${resetSeconds} segundos.`,
          retry_after_seconds: resetSeconds
        }
      });
      return;
    }

    next();
  };
}

/**
 * TS-WH-11: Verificador de Firma Criptográfica HMAC-SHA256 (Stripe / Svix Standard)
 * Formato esperado en cabecera:
 * X-TSolutions-Signature: t={timestamp},v1={hex_signature}
 * o firma directa hex: sha256={hex_signature}
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  signatureHeader: string,
  secretKey: string,
  toleranceSeconds: number = 300 // 5 minutos de tolerancia para prevenir ataques de replay
): { isValid: boolean; reason?: string } {
  if (!signatureHeader || !secretKey) {
    return { isValid: false, reason: 'Falta cabecera de firma o clave secreta' };
  }

  // 1. Formato con Timestamp estilo Stripe/Svix: "t=1620000000,v1=abcdef..."
  if (signatureHeader.includes('t=') && signatureHeader.includes('v1=')) {
    const parts = signatureHeader.split(',');
    let timestamp = '';
    let hash = '';

    for (const part of parts) {
      const [k, v] = part.trim().split('=');
      if (k === 't') timestamp = v;
      if (k === 'v1') hash = v;
    }

    if (!timestamp || !hash) {
      return { isValid: false, reason: 'Formato de cabecera de firma inválido' };
    }

    // Comprobar ventana de tiempo contra replay attacks
    const sentTime = parseInt(timestamp, 10);
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - sentTime) > toleranceSeconds) {
      return { isValid: false, reason: 'Firma expirada (Timestamp fuera de ventana permitida)' };
    }

    // Calcular firma esperada
    const payloadToSign = `${timestamp}.${rawBody.toString()}`;
    const expectedHash = crypto.createHmac('sha256', secretKey).update(payloadToSign).digest('hex');

    try {
      const isMatch = crypto.timingSafeEqual(
        Buffer.from(hash, 'hex'),
        Buffer.from(expectedHash, 'hex')
      );
      return { isValid: isMatch, reason: isMatch ? undefined : 'Firma criptográfica HMAC no coincide' };
    } catch {
      return { isValid: false, reason: 'Error al comparar hashes' };
    }
  }

  // 2. Formato GitHub directo: "sha256=abcdef..."
  const cleanSig = signatureHeader.startsWith('sha256=') ? signatureHeader.substring(7) : signatureHeader;
  const expectedHash = crypto.createHmac('sha256', secretKey).update(rawBody).digest('hex');

  try {
    const isMatch = crypto.timingSafeEqual(
      Buffer.from(cleanSig, 'hex'),
      Buffer.from(expectedHash, 'hex')
    );
    return { isValid: isMatch, reason: isMatch ? undefined : 'Firma criptográfica HMAC no coincide' };
  } catch {
    return { isValid: false, reason: 'Longitud de firma no válida para comparación segura' };
  }
}
