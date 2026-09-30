import { Pool, PoolClient } from 'pg';
import crypto from 'crypto';
import { Server as SocketIOServer } from 'socket.io';
import { BrandEnforcerService } from './brandEnforcer.service';
import { BlueprintEngineService, ProjectArchetype } from './blueprintEngine.service';
import { NexusOnboardingSessionInput } from '../validation/schemas';
import { DEFAULT_WORKSPACE_ID } from '../middleware/workspace.middleware';

export interface OnboardingResult {
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
  clientUser: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  project: {
    id: string;
    name: string;
    archetype: ProjectArchetype;
    status: string;
    tech_stack: Record<string, any>;
  };
  contract: {
    id: string;
    title: string;
    deliverable_type: string;
    total_amount: number;
    currency: string;
  };
  webhookConfig: {
    routing_key: string;
    webhook_url: string;
    provider: string;
  };
  dag: {
    workflowId: string;
    nodeCount: number;
    edgeCount: number;
  };
}

export class NexusOnboardingService {
  private brandEnforcer: BrandEnforcerService;

  constructor(
    private pool: Pool,
    private io?: SocketIOServer
  ) {
    this.brandEnforcer = new BrandEnforcerService(pool);
  }

  /**
   * Obtiene la lista completa de paquetes del Catálogo Oficial de Servicios
   * clasificados por dominio de TSolutions IPIDD.
   */
  public async getServiceCatalog(): Promise<any[]> {
    const res = await this.pool.query(
      `SELECT * FROM system_service_catalog ORDER BY domain, price_amount ASC`
    );
    return res.rows;
  }

  /**
   * Obtiene el detalle de un paquete específico por su código único.
   */
  public async getPackageByCode(packageCode: string): Promise<any | null> {
    const res = await this.pool.query(
      `SELECT * FROM system_service_catalog WHERE package_code = $1`,
      [packageCode]
    );
    return res.rows[0] || null;
  }

  /**
   * Obtiene el contrato compilado de un proyecto.
   */
  public async getProjectContract(workspaceId: string, projectId: string): Promise<any | null> {
    const res = await this.pool.query(
      `SELECT * FROM corporate_deliverables 
       WHERE workspace_id = $1 AND project_id = $2 AND deliverable_type LIKE 'CONTRACT_%'
       ORDER BY created_at DESC LIMIT 1`,
      [workspaceId, projectId]
    );
    return res.rows[0] || null;
  }

  /**
   * Ejecuta transaccionalmente el aprovisionamiento completo del proyecto:
   * 1. Creación de Workspace aislado (slug único)
   * 2. Alta de Usuario Cliente (rol CLIENT) y membresía
   * 3. Asignación de Equipo RACI (Admin/Collaborators)
   * 4. Registro del Proyecto con Tech Stack
   * 5. Configuración Criptográfica de Webhook CI/CD (Routing Key aleatoria)
   * 6. Compilación de Contrato Legal Oficial en corporate_deliverables con BrandEnforcer
   * 7. Siembra del Grafo DAG en RED y Tareas To-Do en TODO con BlueprintEngine
   * 8. Registro de Hito de Entrega en calendar_events
   */
  public async processOnboardingSession(
    input: NexusOnboardingSessionInput,
    creatorUserId?: string
  ): Promise<OnboardingResult> {
    const client: PoolClient = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // -----------------------------------------------------------------------
      // PASO 1: CREACIÓN DEL WORKSPACE AISLADO (SLUG ÚNICO)
      // -----------------------------------------------------------------------
      const baseSlugName = (input.company_name || input.project_name || 'workspace')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 40);

      const uniqueSuffix = crypto.randomBytes(3).toString('hex');
      const workspaceSlug = `${baseSlugName}-${uniqueSuffix}`;
      const workspaceName = input.company_name 
        ? `${input.company_name} • Workspace` 
        : `${input.project_name} Workspace`;

      const wsRes = await client.query(
        `INSERT INTO workspaces (name, slug, description)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [
          workspaceName,
          workspaceSlug,
          `Espacio de trabajo aprovisionado por Nexus Architect Studio para ${input.client_name}`
        ]
      );
      const workspace = wsRes.rows[0];
      const workspaceId = workspace.id;

      // Configurar RLS temporal dentro de la sesión de transacción
      await client.query(`SELECT set_config('app.current_workspace_id', $1, true)`, [workspaceId]);

      // -----------------------------------------------------------------------
      // PASO 2: ALTA DE CLIENTE COMO OWNER / USUARIO CLIENT
      // -----------------------------------------------------------------------
      const userRes = await client.query(
        `INSERT INTO users (name, email, role)
         VALUES ($1, $2, 'CLIENT')
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
         RETURNING *`,
        [input.client_name, input.client_email.toLowerCase()]
      );
      const clientUser = userRes.rows[0];

      // Membresía en workspace_members
      await client.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role)
         VALUES ($1, $2, 'CLIENT')
         ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'CLIENT'`,
        [workspaceId, clientUser.id]
      );

      // Si el creador de la sesión está autenticado y es distinto al cliente, añadirlo como ADMIN
      if (creatorUserId && creatorUserId !== clientUser.id) {
        await client.query(
          `INSERT INTO workspace_members (workspace_id, user_id, role)
           VALUES ($1, $2, 'ADMIN')
           ON CONFLICT DO NOTHING`,
          [workspaceId, creatorUserId]
        );
      }

      // -----------------------------------------------------------------------
      // PASO 3: MATRIZ RACI (TECH LEAD, PM, COLABORADORES)
      // -----------------------------------------------------------------------
      if (input.raci?.tech_lead_email) {
        const tlRes = await client.query(
          `INSERT INTO users (name, email, role)
           VALUES ($1, $2, 'ADMIN')
           ON CONFLICT (email) DO UPDATE SET role = 'ADMIN'
           RETURNING id`,
          [input.raci.tech_lead_name || 'Tech Lead', input.raci.tech_lead_email.toLowerCase()]
        );
        await client.query(
          `INSERT INTO workspace_members (workspace_id, user_id, role)
           VALUES ($1, $2, 'ADMIN')
           ON CONFLICT DO NOTHING`,
          [workspaceId, tlRes.rows[0].id]
        );
      }

      if (input.raci?.project_manager_email) {
        const pmRes = await client.query(
          `INSERT INTO users (name, email, role)
           VALUES ($1, $2, 'ADMIN')
           ON CONFLICT (email) DO UPDATE SET role = 'ADMIN'
           RETURNING id`,
          [input.raci.project_manager_name || 'Project Manager', input.raci.project_manager_email.toLowerCase()]
        );
        await client.query(
          `INSERT INTO workspace_members (workspace_id, user_id, role)
           VALUES ($1, $2, 'ADMIN')
           ON CONFLICT DO NOTHING`,
          [workspaceId, pmRes.rows[0].id]
        );
      }

      if (Array.isArray(input.raci?.collaborators)) {
        for (const col of input.raci.collaborators) {
          if (col.email) {
            const colRes = await client.query(
              `INSERT INTO users (name, email, role)
               VALUES ($1, $2, 'COLLABORATOR')
               ON CONFLICT (email) DO UPDATE SET role = 'COLLABORATOR'
               RETURNING id`,
              [col.name || 'Colaborador Técnico', col.email.toLowerCase()]
            );
            await client.query(
              `INSERT INTO workspace_members (workspace_id, user_id, role)
               VALUES ($1, $2, 'COLLABORATOR')
               ON CONFLICT DO NOTHING`,
              [workspaceId, colRes.rows[0].id]
            );
          }
        }
      }

      // -----------------------------------------------------------------------
      // PASO 4: RESOLUCIÓN DE PAQUETE Y TARIFAS DEL CATÁLOGO
      // -----------------------------------------------------------------------
      const pkgRes = await client.query(
        `SELECT * FROM system_service_catalog WHERE package_code = $1`,
        [input.commercial.package_code]
      );
      const servicePackage = pkgRes.rows[0] || {
        package_name: `${input.archetype} Custom Setup`,
        price_amount: 15000.00,
        currency: 'MXN',
        estimated_delivery_days: 14,
        tech_stack_preset: {}
      };

      const finalAmount = input.commercial.custom_price ?? Number(servicePackage.price_amount);
      const currency = servicePackage.currency || 'MXN';

      // -----------------------------------------------------------------------
      // PASO 5: REGISTRO DEL PROYECTO
      // -----------------------------------------------------------------------
      const combinedTechStack = {
        archetype: input.archetype,
        domain: servicePackage.domain || 'www.tsolutionsipidd.com',
        technologies: servicePackage.tech_stack_preset?.technologies || ['TypeScript', 'PostgreSQL', 'Cloud Run'],
        hosting: servicePackage.tech_stack_preset?.hosting || 'Vercel / Cloud Run',
        target_domain: input.target_domain || null,
        payment_gateway: input.technical?.payment_gateway || 'NONE',
        payment_terms: input.commercial.payment_terms,
        raci: {
          responsible: input.raci?.tech_lead_name || 'Tech Lead Asignado',
          accountable: input.raci?.project_manager_name || 'Project Manager Asignado',
          client: input.client_name
        }
      };

      const projRes = await client.query(
        `INSERT INTO projects (
          workspace_id, name, description, github_repo, tech_stack, status
        ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
        RETURNING *`,
        [
          workspaceId,
          input.project_name,
          input.project_description || servicePackage.description,
          input.technical?.github_repo || `tsolutions-ipidd/${workspaceSlug}`,
          JSON.stringify(combinedTechStack)
        ]
      );
      const project = projRes.rows[0];
      const projectId = project.id;

      // -----------------------------------------------------------------------
      // PASO 6: CONFIGURACIÓN CRIPTOGRÁFICA DE WEBHOOK CI/CD
      // -----------------------------------------------------------------------
      const routingKey = crypto.randomBytes(20).toString('hex');
      const secretToken = crypto.randomBytes(32).toString('hex');
      const webhookUrl = `/api/v1/webhooks/master/${routingKey}`;
      const provider = (input.technical?.repository_provider || 'GITHUB').toLowerCase();

      const webhookRes = await client.query(
        `INSERT INTO project_webhook_configs (
          workspace_id, project_id, provider, routing_key, secret_token, secret_hmac, webhook_url, is_active
        ) VALUES ($1, $2, $3, $4, $5, $5, $6, true)
        RETURNING *`,
        [workspaceId, projectId, provider, routingKey, secretToken, webhookUrl]
      );
      const webhookConfig = webhookRes.rows[0];

      // -----------------------------------------------------------------------
      // PASO 7: COMPILACIÓN DEL CONTRATO LEGAL EN corporate_deliverables
      // -----------------------------------------------------------------------
      let deliveryDateStr = input.commercial.target_delivery_date;
      if (!deliveryDateStr) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + (servicePackage.estimated_delivery_days || 14));
        deliveryDateStr = targetDate.toISOString().split('T')[0];
      }

      const contractCompiled = await this.brandEnforcer.compileProjectContract(
        workspaceId,
        projectId,
        {
          client_name: input.client_name,
          client_email: input.client_email,
          company_name: input.company_name || undefined,
          archetype: input.archetype,
          package_name: servicePackage.package_name,
          package_code: input.commercial.package_code,
          total_amount: finalAmount,
          currency,
          payment_terms: input.commercial.payment_terms,
          delivery_date: deliveryDateStr,
          domain_url: input.target_domain || undefined,
          tech_stack: combinedTechStack.technologies,
          sla_availability: servicePackage.archetype === 'BIOLINK' ? '99.5%' : '99.9%',
          warranty_days: 60
        },
        clientUser.id,
        client // Pasar el client transaccional para evitar bloqueos
      );

      // -----------------------------------------------------------------------
      // PASO 8: SEMBRADO DEL GRAFO DAG EN RED Y TAREAS EN TODO (BLUEPRINT ENGINE)
      // -----------------------------------------------------------------------
      const dagResult = await BlueprintEngineService.generate(
        client,
        projectId,
        combinedTechStack,
        input.archetype
      );

      // -----------------------------------------------------------------------
      // PASO 9: REGISTRO DE EVENTO EN CALENDARIO MAESTRO
      // -----------------------------------------------------------------------
      const startDate = new Date();
      const dueDate = new Date(deliveryDateStr);

      await client.query(
        `INSERT INTO calendar_events (
          workspace_id, project_id, title, description, start_date, due_date,
          event_type, priority, status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'DELIVERY_DEADLINE', 'HIGH', 'PENDING')`,
        [
          workspaceId,
          projectId,
          `Entrega Contractual: ${project.name}`,
          `Hito final de pase a producción y auditoría Six Sigma para ${input.client_name}. Paquete: ${servicePackage.package_name}`,
          startDate.toISOString(),
          dueDate.toISOString()
        ]
      );

      // Commit de la transacción atómica
      await client.query('COMMIT');

      // -----------------------------------------------------------------------
      // PASO 10: NOTIFICACIÓN WEBSOCKET
      // -----------------------------------------------------------------------
      if (this.io) {
        const wsPayload = {
          workspaceId,
          projectId,
          projectName: project.name,
          archetype: input.archetype,
          clientName: input.client_name,
          routingKey,
          timestamp: new Date().toISOString()
        };
        this.io.to(`workspace_${workspaceId}`).emit('WORKSPACE_PROVISIONED', wsPayload);
        this.io.emit('NEW_PROJECT_ONBOARDED', wsPayload);
      }

      return {
        workspace: {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug
        },
        clientUser: {
          id: clientUser.id,
          name: clientUser.name,
          email: clientUser.email,
          role: clientUser.role
        },
        project: {
          id: project.id,
          name: project.name,
          archetype: input.archetype,
          status: project.status,
          tech_stack: combinedTechStack
        },
        contract: {
          id: contractCompiled.deliverable.id,
          title: contractCompiled.deliverable.title,
          deliverable_type: contractCompiled.deliverable.deliverable_type,
          total_amount: finalAmount,
          currency
        },
        webhookConfig: {
          routing_key: webhookConfig.routing_key,
          webhook_url: webhookConfig.webhook_url,
          provider: webhookConfig.provider
        },
        dag: {
          workflowId: dagResult.workflowId,
          nodeCount: dagResult.nodeIds.length,
          edgeCount: dagResult.edgeCount
        }
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('[NexusOnboardingService Error]:', err);
      throw err;
    } finally {
      client.release();
    }
  }
}
