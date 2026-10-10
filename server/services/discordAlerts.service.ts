import crypto from 'crypto';

export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface AlertField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  timestamp?: string;
  fields?: AlertField[];
  footer?: { text: string };
}

export class DiscordAlertsService {
  private static instance: DiscordAlertsService;
  private webhookUrl: string | null = null;
  private recentAlerts: Map<string, number> = new Map();
  private readonly dedupWindowMs: number = 60000; // 60 segundos de deduplicación

  private constructor() {
    this.webhookUrl = process.env.DISCORD_ALERTS_WEBHOOK_URL || null;
  }

  public static getInstance(): DiscordAlertsService {
    if (!DiscordAlertsService.instance) {
      DiscordAlertsService.instance = new DiscordAlertsService();
    }
    return DiscordAlertsService.instance;
  }

  /**
   * Permite inyectar o actualizar la URL del webhook en tiempo de ejecución o tests
   */
  public setWebhookUrl(url: string | null): void {
    this.webhookUrl = url;
  }

  public isConfigured(): boolean {
    return Boolean(this.webhookUrl && this.webhookUrl.startsWith('https://'));
  }

  /**
   * Genera un hash único del mensaje para deduplicación
   */
  private getFingerprint(title: string, message: string): string {
    return crypto.createHash('sha256').update(`${title}:${message}`).digest('hex').substring(0, 16);
  }

  /**
   * Limpia alertas viejas del mapa de deduplicación
   */
  private cleanupOldAlerts(): void {
    const now = Date.now();
    for (const [key, timestamp] of this.recentAlerts.entries()) {
      if (now - timestamp > this.dedupWindowMs) {
        this.recentAlerts.delete(key);
      }
    }
  }

  /**
   * Envía un embed formateado a Discord sin bloquear la ejecución
   */
  public async sendEmbed(embed: DiscordEmbed): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    const fingerprint = this.getFingerprint(embed.title, embed.description);
    const now = Date.now();
    this.cleanupOldAlerts();

    if (this.recentAlerts.has(fingerprint)) {
      // Supresión por deduplicación
      return false;
    }

    this.recentAlerts.set(fingerprint, now);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const payload = {
        username: 'TSolutions SRE Watchdog',
        avatar_url: 'https://cdn-icons-png.flaticon.com/512/906/906334.png',
        embeds: [
          {
            ...embed,
            timestamp: embed.timestamp || new Date().toISOString(),
            footer: embed.footer || { text: `TSolutions Zero-Cost Observability • Env: ${process.env.NODE_ENV || 'development'}` }
          }
        ]
      };

      const res = await fetch(this.webhookUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return res.ok;
    } catch (err: any) {
      console.warn('[DiscordAlertsService] No se pudo despachar la alerta a Discord:', err.message);
      return false;
    }
  }

  /**
   * Envía una alerta de error no controlado (Global Error Handler)
   */
  public async sendErrorAlert(
    err: Error | any,
    context?: { route?: string; method?: string; ip?: string; userId?: string }
  ): Promise<boolean> {
    const message = err?.message || String(err) || 'Error desconocido';
    const stack = (err?.stack || '').substring(0, 800);

    const fields: AlertField[] = [];
    if (context?.route) {
      fields.push({ name: 'Ruta / Endpoint', value: `\`${context.method || 'GET'} ${context.route}\``, inline: true });
    }
    if (context?.ip) {
      fields.push({ name: 'IP Origen', value: `\`${context.ip}\``, inline: true });
    }
    if (context?.userId) {
      fields.push({ name: 'Usuario / Tenant', value: `\`${context.userId}\``, inline: true });
    }
    if (stack) {
      fields.push({ name: 'Stack Trace', value: `\`\`\`javascript\n${stack}\n\`\`\``, inline: false });
    }

    return this.sendEmbed({
      title: '🚨 [CRITICAL] Excepción no controlada en Servidor',
      description: `**Mensaje:** ${message}`,
      color: 0xed4245, // Rojo Discord
      fields
    });
  }

  /**
   * Envía una alerta cuando un webhook agota sus reintentos y es enviado a Dead Letter Queue (DLQ)
   */
  public async sendDlqAlert(entry: {
    id: string;
    targetUrl: string;
    sourceDomain: string;
    attempts: number;
    finalError: string;
    workspaceId?: string;
  }): Promise<boolean> {
    const fields: AlertField[] = [
      { name: 'DLQ ID', value: `\`${entry.id}\``, inline: true },
      { name: 'Dominio Origen', value: `\`${entry.sourceDomain}\``, inline: true },
      { name: 'Intentos Agotados', value: `${entry.attempts}`, inline: true },
      { name: 'URL Destino', value: `\`${entry.targetUrl}\``, inline: false },
      { name: 'Error Final', value: `\`\`\`${entry.finalError.substring(0, 500)}\`\`\``, inline: false }
    ];

    if (entry.workspaceId) {
      fields.push({ name: 'Workspace Tenant', value: `\`${entry.workspaceId}\``, inline: true });
    }

    return this.sendEmbed({
      title: '⚠️ [DLQ] Webhook Desviado a Dead Letter Queue',
      description: `El webhook hacia **${entry.targetUrl}** falló todos los reintentos con backoff exponencial. Se requiere inspección o reenvío manual (1-Click Replay).`,
      color: 0xfee75c, // Amarillo advertencia
      fields
    });
  }

  /**
   * Envía una alerta de degradación de SLO (Disponibilidad < 99.9% o Latencia P95 > 200ms)
   */
  public async sendSloBreachAlert(metric: string, currentRate: number, targetRate: number): Promise<boolean> {
    return this.sendEmbed({
      title: '📉 [SLO BREACH] Degradación de Nivel de Servicio',
      description: `La métrica **${metric}** ha caído por debajo del objetivo contractual de confiabilidad.`,
      color: 0xe67e22, // Naranja
      fields: [
        { name: 'Métrica Afectada', value: metric, inline: true },
        { name: 'Valor Actual', value: `${currentRate.toFixed(2)}%`, inline: true },
        { name: 'Objetivo SLO', value: `${targetRate.toFixed(2)}%`, inline: true }
      ]
    });
  }

  /**
   * Envía un aviso informativo de despliegue o reinicio de servicios
   */
  public async sendDeploymentAlert(version: string, commitSha?: string): Promise<boolean> {
    return this.sendEmbed({
      title: '🚀 [DEPLOY] Nueva Versión Desplegada Exitosamente',
      description: `La aplicación se ha iniciado y verificado con los health checks en verde.`,
      color: 0x57f287, // Verde
      fields: [
        { name: 'Versión', value: version, inline: true },
        { name: 'Commit Git', value: commitSha ? `\`${commitSha.substring(0, 7)}\`` : 'N/A', inline: true },
        { name: 'Costo Infraestructura', value: '$0.00 / mes (Free Tier Top)', inline: true }
      ]
    });
  }
}
