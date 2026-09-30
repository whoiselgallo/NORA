import { PoolClient } from 'pg';

export interface BlueprintNodeDef {
  title: string;
  category: 'infra' | 'backend' | 'frontend' | 'devops' | 'qa' | 'marketing';
  is_automated_github: boolean;
  github_trigger_event?: string;
  position_x: number;
  position_y: number;
  default_tasks: Array<{ title: string; description: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' }>;
}

export class BlueprintEngineService {
  private static SEQUENCE: BlueprintNodeDef[] = [
    {
      title: 'Infraestructura & Base de Datos',
      category: 'infra',
      is_automated_github: false,
      position_x: 80,
      position_y: 220,
      default_tasks: [
        { title: 'Ejecutar esquema DDL relacional', description: 'Creación de tablas, enums e índices en PostgreSQL.', priority: 'HIGH' },
        { title: 'Configurar variables de pooling', description: 'Asignar DATABASE_URL_UNPOOLED y verificar conexión.', priority: 'HIGH' }
      ]
    },
    {
      title: 'Servicios Core & API REST',
      category: 'backend',
      is_automated_github: false,
      position_x: 380,
      position_y: 220,
      default_tasks: [
        { title: 'Rutas CRUD de tareas y proyectos', description: 'Controladores con tipado estricto en TypeScript.', priority: 'MEDIUM' },
        { title: 'Integración de autenticación y roles', description: 'Restricción de mutación para rol CLIENT.', priority: 'HIGH' }
      ]
    },
    {
      title: 'Interfaz de Usuario & React Flow',
      category: 'frontend',
      is_automated_github: false,
      position_x: 680,
      position_y: 220,
      default_tasks: [
        { title: 'Construir WorkflowCanvas interactivo', description: 'Integración de React Flow con CustomNode #10B981 / #EF4444.', priority: 'MEDIUM' },
        { title: 'Módulo To-Do con optimismo de UI', description: 'Lista estilo Microsoft To-Do con filtro por estado y prioridad.', priority: 'MEDIUM' }
      ]
    },
    {
      title: 'Telemetría & Webhooks GitHub',
      category: 'devops',
      is_automated_github: true,
      github_trigger_event: 'workflow_run',
      position_x: 980,
      position_y: 220,
      default_tasks: [
        { title: 'Verificación de firma HMAC SHA-256', description: 'Rechazo 401 Unauthorized ante firmas inválidas.', priority: 'CRITICAL' },
        { title: 'Transición automática a GREEN', description: 'Mudar nodo ante workflow_run conclusion success.', priority: 'HIGH' }
      ]
    },
    {
      title: 'Campaña de Mercadotecnia Masiva',
      category: 'marketing',
      is_automated_github: false,
      position_x: 1280,
      position_y: 220,
      default_tasks: [
        { title: 'Configurar colas BullMQ y límites de tasa', description: 'Worker con retroceso exponencial ante rate limits.', priority: 'HIGH' },
        { title: 'Alcanzar 95% de tasa de entrega exitosa', description: 'Condición requerida para mutar nodo a GREEN.', priority: 'HIGH' }
      ]
    }
  ];

  public static async generate(
    client: PoolClient,
    projectId: string,
    _techStack: Record<string, unknown> = {}
  ): Promise<{ workflowId: string; nodeIds: string[]; edgeCount: number }> {
    const wfRes = await client.query(
      `INSERT INTO project_workflows (project_id, name) VALUES ($1, 'Primary DAG Workflow') RETURNING id`,
      [projectId]
    );
    const workflowId = wfRes.rows[0].id;

    const projRes = await client.query(
      `SELECT workspace_id FROM projects WHERE id = $1`,
      [projectId]
    );
    const workspaceId = projRes.rows[0]?.workspace_id || '00000000-0000-0000-0000-000000000001';

    const createdNodeIds: string[] = [];

    for (const def of this.SEQUENCE) {
      const slug = def.title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const nodeRes = await client.query(
        `INSERT INTO workflow_nodes 
          (workflow_id, slug, label, title, category, position_x, position_y, status, is_automated_github, github_trigger_event)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'RED', $8, $9)
         RETURNING id`,
        [
          workflowId,
          slug,
          def.title,
          def.title,
          def.category,
          def.position_x,
          def.position_y,
          def.is_automated_github,
          def.github_trigger_event || null
        ]
      );
      const nodeId = nodeRes.rows[0].id;
      createdNodeIds.push(nodeId);

      for (const t of def.default_tasks) {
        const taskRes = await client.query(
          `INSERT INTO project_tasks (workspace_id, project_id, title, description, priority, status)
           VALUES ($1, $2, $3, $4, $5, 'TODO') RETURNING id`,
          [workspaceId, projectId, t.title, t.description, t.priority]
        );
        const taskId = taskRes.rows[0].id;

        await client.query(
          `INSERT INTO workflow_node_tasks (node_id, task_id) VALUES ($1, $2)`,
          [nodeId, taskId]
        );
      }
    }

    let edgeCount = 0;
    for (let i = 0; i < createdNodeIds.length - 1; i++) {
      await client.query(
        `INSERT INTO workflow_edges (workflow_id, source_node_id, target_node_id) VALUES ($1, $2, $3)`,
        [workflowId, createdNodeIds[i], createdNodeIds[i + 1]]
      );
      edgeCount++;
    }

    return { workflowId, nodeIds: createdNodeIds, edgeCount };
  }
}
