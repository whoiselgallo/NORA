import { Pool } from 'pg';
import { OperationalProjectContext } from '../types/aiGateway.types';

export class AIContextAssembler {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Reúne el contexto operativo de PostgreSQL para un proyecto.
   */
  async assembleProjectContext(projectId: string): Promise<OperationalProjectContext> {
    // 1. Proyecto
    const projectRes = await this.pool.query(
      `SELECT id, name, description, github_repo_owner, github_repo_name, tech_stack
       FROM projects WHERE id = $1`,
      [projectId]
    );

    if (projectRes.rows.length === 0) {
      throw new Error(`Project with ID ${projectId} not found.`);
    }

    const p = projectRes.rows[0];

    // 2. Nodos y estado de tareas asociadas
    const nodesRes = await this.pool.query(
      `SELECT 
         wn.id, 
         COALESCE(wn.title, wn.slug) as title, 
         wn.category, 
         wn.status,
         COUNT(pt.id) as total_tasks,
         COUNT(CASE WHEN pt.status = 'DONE' THEN 1 END) as completed_tasks
       FROM project_workflows pw
       JOIN workflow_nodes wn ON wn.workflow_id = pw.id
       LEFT JOIN workflow_node_tasks wnt ON wnt.node_id = wn.id
       LEFT JOIN project_tasks pt ON pt.id = wnt.task_id
       WHERE pw.project_id = $1
       GROUP BY wn.id, wn.title, wn.slug, wn.category, wn.status, wn.position_x
       ORDER BY wn.position_x ASC`,
      [projectId]
    );

    const nodes = nodesRes.rows.map(r => ({
      id: r.id,
      title: r.title,
      category: r.category || 'backend',
      status: r.status as 'RED' | 'GREEN',
      tasksCount: parseInt(r.total_tasks, 10) || 0,
      completedTasksCount: parseInt(r.completed_tasks, 10) || 0,
    }));

    // 3. Últimos 5 eventos de telemetría
    const telemetryRes = await this.pool.query(
      `SELECT event_type, conclusion, commit_sha, duration_ms, created_at
       FROM github_telemetry_events
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [projectId]
    );

    const recentTelemetry = telemetryRes.rows.map(r => ({
      eventType: r.event_type,
      status: r.conclusion || 'completed',
      commitSha: r.commit_sha || 'head',
      durationSeconds: Math.round((r.duration_ms || 0) / 1000),
      receivedAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    }));

    // 4. Colaboradores y tareas activas
    const collabsRes = await this.pool.query(
      `SELECT u.id, u.name, u.role,
         COUNT(pt.id) FILTER (WHERE pt.status IN ('TODO', 'IN_PROGRESS')) as active_tasks
       FROM users u
       LEFT JOIN project_members pm ON pm.user_id = u.id AND pm.project_id = $1
       LEFT JOIN project_tasks pt ON pt.assigned_to = u.id AND pt.project_id = $1
       GROUP BY u.id, u.name, u.role`,
      [projectId]
    );

    const collaborators = collabsRes.rows.map(r => ({
      id: r.id,
      name: r.name,
      role: r.role,
      activeTasks: parseInt(r.active_tasks, 10) || 0,
    }));

    return {
      projectId: p.id,
      projectName: p.name,
      description: p.description || '',
      techStack: (p.tech_stack as Record<string, unknown>) || {},
      githubRepo: {
        owner: p.github_repo_owner || '',
        name: p.github_repo_name || '',
      },
      nodes,
      recentTelemetry,
      collaborators,
    };
  }

  /**
   * Inyecta conocimiento estandarizado según el rol y dominio técnico.
   */
  injectKnowledge(domain: 'blueprint' | 'devops' | 'tasks' | 'marketing' | 'executive'): string {
    switch (domain) {
      case 'blueprint':
        return `[KNOWLEDGE_INJECTION: BLUEPRINT]
- Fases obligatorias para React Flow: infra -> backend -> frontend -> devops -> qa.
- Coordenadas React Flow: separación horizontal mínima 220px, vertical 100px.
- Todos los nodos nacen con status='RED'.
- Integración CI/CD: is_automated_github=true si la fase se convalida con workflow_run de GitHub Actions.`;

      case 'devops':
        return `[KNOWLEDGE_INJECTION: DEVOPS_TRIAGE]
- Identifica si el error es de TypeScript (TSXXXX), dependencia no encontrada en npm/yarn, fallo de test unitario (Jest/Vitest), linter ESLint o variable de entorno faltante.
- Proporciona severidad y comando ejecutable de corrección.`;

      case 'tasks':
        return `[KNOWLEDGE_INJECTION: TASK_PLANNER]
- Cada subtarea debe ser atómica (máximo 4 horas de dedicación técnica).
- Verbo en infinitivo o imperativo.
- Criterios de aceptación comprobables y definición de terminado (DoD).`;

      case 'marketing':
        return `[KNOWLEDGE_INJECTION: EMAIL_DELIVERABILITY]
- Estándares RFC 8058: List-Unsubscribe con soporte One-Click.
- Compatibilidad HTML para clientes móviles y Outlook con tablas e inline CSS.
- Tokens dinámicos requeridos: {{first_name}}, {{company}}.
- Filtro antispam: penalizar mayúsculas sostenidas, palabras desencadenantes ('GRATIS', 'URGENTE', 'COMPRA YA').`;

      case 'executive':
        return `[KNOWLEDGE_INJECTION: EXECUTIVE_TRANSLATION]
- Prohibido terminología técnica cruda (sin hashes SHA, nombres de ramas, puertos o sintaxis SQL).
- Traducir CI/CD a "estabilidad y seguridad de la plataforma".
- Enfoque en retorno de inversión, tiempos de entrega y continuidad de negocio.`;
    }
  }
}
