import { PoolClient } from 'pg';

export interface TechStackConfig {
  backend?: string;
  database?: string;
  frontend?: string;
  cicd?: string;
  [key: string]: unknown;
}

export interface NodeBlueprint {
  slug: string;
  label: string;
  description: string;
  step_order: number;
  is_automated_github: boolean;
  position_x: number;
  position_y: number;
  default_tasks: Array<{ title: string; description: string }>;
}

export class BlueprintEngineService {
  private static BLUEPRINT_NODES: NodeBlueprint[] = [
    {
      slug: 'infra_database',
      label: 'Infraestructura / Base de datos',
      description: 'Modelado DDL, pooling relacional, migraciones e índices.',
      step_order: 1,
      is_automated_github: false,
      position_x: 100,
      position_y: 200,
      default_tasks: [
        { title: 'Ejecutar esquema DDL y tipos enumerados', description: 'Creación de tablas relacionales y constraints.' },
        { title: 'Configurar conexión y pooling en Neon', description: 'Asignar DATABASE_URL_UNPOOLED y verificar conexión.' }
      ]
    },
    {
      slug: 'core_services_api',
      label: 'Servicios Core / API',
      description: 'Arquitectura de endpoints REST, tipados estrictos y controladores.',
      step_order: 2,
      is_automated_github: false,
      position_x: 420,
      position_y: 200,
      default_tasks: [
        { title: 'Definir contratos TypeScript y DTOs', description: 'Validación estricta de payloads con esquemas.' },
        { title: 'Implementar servicios y controladores CRUD', description: 'Desacoplamiento de lógica de persistencia.' }
      ]
    },
    {
      slug: 'ui_frontend',
      label: 'Interfaz de Usuario / Frontend',
      description: 'Maquetación responsive, componentes atómicos y consumo de API.',
      step_order: 3,
      is_automated_github: false,
      position_x: 740,
      position_y: 200,
      default_tasks: [
        { title: 'Configurar Design Tokens y Paleta de Colores', description: 'Variables CSS y tokens Tailwind.' },
        { title: 'Implementar vistas interactivas y lienzo React Flow', description: 'Nodos personalizados y consumo WebSocket.' }
      ]
    },
    {
      slug: 'telemetry_webhooks',
      label: 'Telemetría & Webhooks',
      description: 'Ingesta de eventos GitHub, verificación HMAC y pulsos WebSocket.',
      step_order: 4,
      is_automated_github: true,
      position_x: 1060,
      position_y: 200,
      default_tasks: [
        { title: 'Verificar firma HMAC SHA-256 de GitHub', description: 'TimingSafeEqual con GITHUB_WEBHOOK_SECRET.' },
        { title: 'Instrumentar eventos DataLayer y canal WebSocket', description: 'Emisión de pulsos de telemetría a clientes.' }
      ]
    },
    {
      slug: 'cicd_deploy',
      label: 'Pipelines CI/CD & Deploy',
      description: 'Automatización de builds, pruebas unitarias y release edge/cloud.',
      step_order: 5,
      is_automated_github: true,
      position_x: 1380,
      position_y: 200,
      default_tasks: [
        { title: 'Configurar GitHub Actions workflow_run', description: 'Pipeline de compilación y verificación automática.' },
        { title: 'Despliegue continuo en ambiente de producción', description: 'Sincronización automática de releases.' }
      ]
    }
  ];

  public static async generateProjectBlueprint(
    client: PoolClient,
    projectId: string,
    projectName: string,
    _techStack: TechStackConfig = {}
  ): Promise<{ workflowId: string; nodeCount: number; edgeCount: number }> {
    // 1. Crear el Workflow del proyecto
    const workflowRes = await client.query(
      `INSERT INTO project_workflows (project_id, name) VALUES ($1, $2) RETURNING id`,
      [projectId, `${projectName} Primary Workflow`]
    );
    const workflowId = workflowRes.rows[0].id;

    const createdNodeIds: string[] = [];

    // 2. Insertar nodos secuenciales y tareas asociadas
    for (const blueprint of this.BLUEPRINT_NODES) {
      const nodeRes = await client.query(
        `INSERT INTO workflow_nodes 
          (workflow_id, slug, label, description, step_order, status, is_automated_github, position_x, position_y)
         VALUES ($1, $2, $3, $4, $5, 'RED', $6, $7, $8)
         RETURNING id`,
        [
          workflowId,
          blueprint.slug,
          blueprint.label,
          blueprint.description,
          blueprint.step_order,
          blueprint.is_automated_github,
          blueprint.position_x,
          blueprint.position_y
        ]
      );
      const nodeId = nodeRes.rows[0].id;
      createdNodeIds.push(nodeId);

      // Crear tareas por defecto y asociarlas al nodo
      for (const t of blueprint.default_tasks) {
        const taskRes = await client.query(
          `INSERT INTO project_tasks (project_id, title, description, status)
           VALUES ($1, $2, $3, 'TODO') RETURNING id`,
          [projectId, t.title, t.description]
        );
        const taskId = taskRes.rows[0].id;

        await client.query(
          `INSERT INTO workflow_node_tasks (node_id, task_id) VALUES ($1, $2)`,
          [nodeId, taskId]
        );
      }
    }

    // 3. Crear conexiones unidireccionales (Edges)
    let edgeCount = 0;
    for (let i = 0; i < createdNodeIds.length - 1; i++) {
      await client.query(
        `INSERT INTO workflow_edges (workflow_id, source_node_id, target_node_id)
         VALUES ($1, $2, $3)`,
        [workflowId, createdNodeIds[i], createdNodeIds[i + 1]]
      );
      edgeCount++;
    }

    return {
      workflowId,
      nodeCount: createdNodeIds.length,
      edgeCount
    };
  }
}
