import { Request, Response } from 'express';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { MasterWebhookHandler } from './master.handler';
import { DEFAULT_WORKSPACE_ID } from '../middleware/workspace.middleware';
import { ChildWebhookPayload } from '../validation/schemas';

export interface ChildSubdomainMeta {
  domain: string;
  subdomain_key: string;
  display_name: string;
  purpose: string;
  endpoint_path: string;
}

export const REGISTERED_CHILD_SUBDOMAINS: Record<string, ChildSubdomainMeta> = {
  'vc.tsolutionsipidd.com': {
    domain: 'vc.tsolutionsipidd.com',
    subdomain_key: 'vc',
    display_name: 'TSolutions Virtual Classroom & Videoconferencias',
    purpose: 'Salas WebRTC, telemetria de reuniones, minutas y transcripciones',
    endpoint_path: '/api/v1/webhooks/child/vc'
  },
  'tsolutionsipidd.com': {
    domain: 'tsolutionsipidd.com',
    subdomain_key: 'main_tsolutions',
    display_name: 'TSolutions IPIDD Dominio Corporativo Principal',
    purpose: 'Captura de leads, contratos digitales, suscripcion enterprise',
    endpoint_path: '/api/v1/webhooks/child/main'
  },
  'admin.lacuevadelguero.com': {
    domain: 'admin.lacuevadelguero.com',
    subdomain_key: 'admin_lacueva',
    display_name: 'La Cueva del Guero Panel de Administracion & POS',
    purpose: 'Alertas de inventario, cortes de caja POS, alertas operativas',
    endpoint_path: '/api/v1/webhooks/child/lacueva-admin'
  },
  's.tsolutionsipidd.com': {
    domain: 's.tsolutionsipidd.com',
    subdomain_key: 's_tsolutions',
    display_name: 'TSolutions Storage, Assets & API Services',
    purpose: 'Eventos de carga en storage, cache CDN, health checks de microservicios',
    endpoint_path: '/api/v1/webhooks/child/s-tsolutions'
  },
  'm.tsolutionsipidd.com': {
    domain: 'm.tsolutionsipidd.com',
    subdomain_key: 'm_tsolutions',
    display_name: 'TSolutions PWA Movil & Mesa de Trabajo',
    purpose: 'Acciones moviles, sincronizacion offline, telemetria PWA',
    endpoint_path: '/api/v1/webhooks/child/m-tsolutions'
  },
  'lacuevadelguero.com': {
    domain: 'lacuevadelguero.com',
    subdomain_key: 'main_lacueva',
    display_name: 'La Cueva del Guero Portal Comercial Principal',
    purpose: 'Pedidos de restaurante, reservaciones de mesas, catalogo comercial',
    endpoint_path: '/api/v1/webhooks/child/lacueva'
  },
  's.lacuevadelguero.com': {
    domain: 's.lacuevadelguero.com',
    subdomain_key: 's_lacueva',
    display_name: 'La Cueva del Guero Sucursales & Delivery',
    purpose: 'Despacho de sucursales, choferes de delivery, webhooks de pagos',
    endpoint_path: '/api/v1/webhooks/child/lacueva-s'
  }
};

export class ChildDomainWebhooksHandler {
  constructor(
    private pool: Pool,
    private io: SocketIOServer,
    private masterWebhookHandler: MasterWebhookHandler
  ) {}

  /**
   * 1. vc.tsolutionsipidd.com (Videoconferencia y Salas Virtuales)
   */
  public handleVcWebhook = async (req: Request, res: Response): Promise<void> => {
    const meta = REGISTERED_CHILD_SUBDOMAINS['vc.tsolutionsipidd.com'];
    const body: ChildWebhookPayload = req.body || {};
    const eventType = body.event_type || body.event || 'VC_EVENT';
    const payload = body.payload || body.data || body;

    const wsId = body.workspace_id || req.workspaceId || DEFAULT_WORKSPACE_ID;
    this.io.to(`workspace_${wsId}`).emit('CHILD_WEBHOOK_EVENT', {
      domain: meta.domain,
      subdomain_key: meta.subdomain_key,
      eventType,
      payload,
      timestamp: new Date().toISOString()
    });

    await this.processAndDelegate(meta, eventType, body, req, res);
  };

  /**
   * 2. tsolutionsipidd.com (Dominio Principal Corporativo & Leads)
   */
  public handleMainTsolutionsWebhook = async (req: Request, res: Response): Promise<void> => {
    const meta = REGISTERED_CHILD_SUBDOMAINS['tsolutionsipidd.com'];
    const body: ChildWebhookPayload = req.body || {};
    const eventType = body.event_type || body.event || 'LEAD_CAPTURED';
    const payload = body.payload || body.data || body;

    const wsId = body.workspace_id || req.workspaceId || DEFAULT_WORKSPACE_ID;
    this.io.to(`workspace_${wsId}`).emit('CHILD_WEBHOOK_EVENT', {
      domain: meta.domain,
      subdomain_key: meta.subdomain_key,
      eventType,
      payload,
      timestamp: new Date().toISOString()
    });

    await this.processAndDelegate(meta, eventType, body, req, res);
  };

  /**
   * 3. admin.lacuevadelguero.com (Panel Administrativo & POS)
   */
  public handleAdminLaCuevaWebhook = async (req: Request, res: Response): Promise<void> => {
    const meta = REGISTERED_CHILD_SUBDOMAINS['admin.lacuevadelguero.com'];
    const body: ChildWebhookPayload = req.body || {};
    const eventType = body.event_type || body.event || 'POS_OPERATION';
    const payload = body.payload || body.data || body;

    const wsId = body.workspace_id || req.workspaceId || DEFAULT_WORKSPACE_ID;
    this.io.to(`workspace_${wsId}`).emit('CHILD_WEBHOOK_EVENT', {
      domain: meta.domain,
      subdomain_key: meta.subdomain_key,
      eventType,
      payload,
      timestamp: new Date().toISOString()
    });

    await this.processAndDelegate(meta, eventType, body, req, res);
  };

  /**
   * 4. s.tsolutionsipidd.com (Storage, Assets, CDN & Microservicios)
   */
  public handleStorageTsolutionsWebhook = async (req: Request, res: Response): Promise<void> => {
    const meta = REGISTERED_CHILD_SUBDOMAINS['s.tsolutionsipidd.com'];
    const body: ChildWebhookPayload = req.body || {};
    const eventType = body.event_type || body.event || 'STORAGE_EVENT';
    const payload = body.payload || body.data || body;

    const wsId = body.workspace_id || req.workspaceId || DEFAULT_WORKSPACE_ID;
    this.io.to(`workspace_${wsId}`).emit('CHILD_WEBHOOK_EVENT', {
      domain: meta.domain,
      subdomain_key: meta.subdomain_key,
      eventType,
      payload,
      timestamp: new Date().toISOString()
    });

    await this.processAndDelegate(meta, eventType, body, req, res);
  };

  /**
   * 5. m.tsolutionsipidd.com (Móvil, PWA y Mesa de Trabajo)
   */
  public handleMobileTsolutionsWebhook = async (req: Request, res: Response): Promise<void> => {
    const meta = REGISTERED_CHILD_SUBDOMAINS['m.tsolutionsipidd.com'];
    const body: ChildWebhookPayload = req.body || {};
    const eventType = body.event_type || body.event || 'MOBILE_SYNC';
    const payload = body.payload || body.data || body;

    const wsId = body.workspace_id || req.workspaceId || DEFAULT_WORKSPACE_ID;
    this.io.to(`workspace_${wsId}`).emit('CHILD_WEBHOOK_EVENT', {
      domain: meta.domain,
      subdomain_key: meta.subdomain_key,
      eventType,
      payload,
      timestamp: new Date().toISOString()
    });

    await this.processAndDelegate(meta, eventType, body, req, res);
  };

  /**
   * 6. lacuevadelguero.com (Portal Comercial La Cueva del Güero)
   */
  public handleMainLaCuevaWebhook = async (req: Request, res: Response): Promise<void> => {
    const meta = REGISTERED_CHILD_SUBDOMAINS['lacuevadelguero.com'];
    const body: ChildWebhookPayload = req.body || {};
    const eventType = body.event_type || body.event || 'ORDER_PLACED';
    const payload = body.payload || body.data || body;

    const wsId = body.workspace_id || req.workspaceId || DEFAULT_WORKSPACE_ID;
    this.io.to(`workspace_${wsId}`).emit('CHILD_WEBHOOK_EVENT', {
      domain: meta.domain,
      subdomain_key: meta.subdomain_key,
      eventType,
      payload,
      timestamp: new Date().toISOString()
    });

    await this.processAndDelegate(meta, eventType, body, req, res);
  };

  /**
   * 7. s.lacuevadelguero.com (Sucursales, Delivery & Pasarelas de Pago)
   */
  public handleBranchesLaCuevaWebhook = async (req: Request, res: Response): Promise<void> => {
    const meta = REGISTERED_CHILD_SUBDOMAINS['s.lacuevadelguero.com'];
    const body: ChildWebhookPayload = req.body || {};
    const eventType = body.event_type || body.event || 'BRANCH_DISPATCH';
    const payload = body.payload || body.data || body;

    const wsId = body.workspace_id || req.workspaceId || DEFAULT_WORKSPACE_ID;
    this.io.to(`workspace_${wsId}`).emit('CHILD_WEBHOOK_EVENT', {
      domain: meta.domain,
      subdomain_key: meta.subdomain_key,
      eventType,
      payload,
      timestamp: new Date().toISOString()
    });

    await this.processAndDelegate(meta, eventType, body, req, res);
  };

  /**
   * Gateway Inteligente Unificado: Detección automática por Host, Header o Payload
   */
  public handleGatewayWebhook = async (req: Request, res: Response): Promise<void> => {
    const forwardedHost = (req.headers['x-forwarded-host'] as string) || '';
    const hostHeader = (req.headers.host as string) || '';
    const body = req.body || {};
    const domainFromPayload = (body.domain as string) || (body.source_domain as string) || '';
    const subdomainKey = (body.subdomain_key as string) || '';

    const candidate = `${forwardedHost} ${hostHeader} ${domainFromPayload} ${subdomainKey}`.toLowerCase();

    if (candidate.includes('vc.tsolutionsipidd.com') || subdomainKey === 'vc') {
      return this.handleVcWebhook(req, res);
    }
    if (candidate.includes('admin.lacuevadelguero.com') || subdomainKey === 'admin_lacueva') {
      return this.handleAdminLaCuevaWebhook(req, res);
    }
    if (candidate.includes('s.tsolutionsipidd.com') || subdomainKey === 's_tsolutions') {
      return this.handleStorageTsolutionsWebhook(req, res);
    }
    if (candidate.includes('m.tsolutionsipidd.com') || subdomainKey === 'm_tsolutions') {
      return this.handleMobileTsolutionsWebhook(req, res);
    }
    if (candidate.includes('s.lacuevadelguero.com') || subdomainKey === 's_lacueva') {
      return this.handleBranchesLaCuevaWebhook(req, res);
    }
    if (candidate.includes('lacuevadelguero.com') || subdomainKey === 'main_lacueva') {
      return this.handleMainLaCuevaWebhook(req, res);
    }

    // Por defecto delega a tsolutionsipidd.com
    return this.handleMainTsolutionsWebhook(req, res);
  };

  /**
   * Consulta pública de subdominios registrados y catálogo de webhooks hijos
   */
  public listChildSubdomains = async (_req: Request, res: Response): Promise<void> => {
    try {
      const dbRes = await this.pool.query(
        `SELECT domain, subdomain_key, display_name, purpose, endpoint_path, is_active, created_at 
         FROM child_webhook_subdomains 
         ORDER BY domain ASC`
      );
      res.json({
        total: dbRes.rows.length,
        master_routing_gateway: '/api/v1/webhooks/gateway',
        subdomains: dbRes.rows
      });
    } catch {
      res.json({
        total: Object.keys(REGISTERED_CHILD_SUBDOMAINS).length,
        master_routing_gateway: '/api/v1/webhooks/gateway',
        subdomains: Object.values(REGISTERED_CHILD_SUBDOMAINS)
      });
    }
  };

  /**
   * Registro en Neon DB y delegación directa al Webhook Master
   */
  private async processAndDelegate(
    meta: ChildSubdomainMeta,
    eventType: string,
    body: ChildWebhookPayload,
    req: Request,
    res: Response
  ): Promise<void> {
    const startTime = Date.now();
    const wsId = body.workspace_id || req.workspaceId || DEFAULT_WORKSPACE_ID;
    const projectId = body.project_id || null;
    const payload = body.payload || body.data || body;
    const routingKey = `CHILD_${meta.subdomain_key.toUpperCase()}`;

    try {
      await this.pool.query(
        `INSERT INTO master_webhook_telemetry_logs (
          source_domain, subdomain_key, routing_key, event_type,
          workspace_id, project_id, payload, status, latency_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PROCESSED', $8)`,
        [
          meta.domain,
          meta.subdomain_key,
          routingKey,
          eventType,
          wsId,
          projectId,
          JSON.stringify(payload),
          Date.now() - startTime
        ]
      );
    } catch (dbErr: any) {
      console.warn(`[ChildWebhook DB Log Warning - ${meta.domain}]:`, dbErr.message);
    }

    // Adaptar req para delegar al MasterWebhookHandler
    req.params = { routingKey };
    req.body = {
      event: eventType,
      routingKey,
      timestamp: body.timestamp || new Date().toISOString(),
      source: meta.domain,
      workspaceId: wsId,
      projectId,
      ...body,
      payload: {
        ...payload,
        origin_domain: meta.domain,
        subdomain_key: meta.subdomain_key
      }
    };

    return this.masterWebhookHandler.handleMasterWebhook(req, res);
  }
}
