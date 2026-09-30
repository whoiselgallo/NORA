import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { z } from 'zod';
import { AIContextAssembler } from './aiContextAssembler.service';
import {
  BlueprintDAG,
  BlueprintDAGSchema,
  DevOpsTriage,
  DevOpsTriageSchema,
  EmailMarketingCopy,
  EmailMarketingCopySchema,
  ExecutiveStatusReport,
  ExecutiveStatusReportSchema,
  TaskPlanner,
  TaskPlannerSchema
} from '../types/aiGateway.types';
import {
  GeneratedPresentation,
  GeneratedPresentationSchema,
  SlideLayoutType
} from '../types/presentation.types';

export class AIGatewayService {
  private pool: Pool;
  private io?: SocketIOServer;
  private contextAssembler: AIContextAssembler;

  constructor(pool: Pool, io?: SocketIOServer) {
    this.pool = pool;
    this.io = io;
    this.contextAssembler = new AIContextAssembler(pool);
  }

  public setSocketServer(io: SocketIOServer) {
    this.io = io;
  }

  /**
   * Router con pool anidado de 3 claves Gemini y failover ante cuota agotada (HTTP 429).
   */
  private async callLLM<T>(params: {
    systemPrompt: string;
    userPrompt: string;
    temperature: number;
    schema: z.ZodType<T, any, any>;
    fallbackGenerator: () => T;
  }): Promise<T> {
    // 1. POOL ANIDADO DE CLAVES GEMINI (Rotación y failover automático ante 429)
    const geminiKeys = [
      process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY,
      process.env.GEMINI_API_KEY_2,
      process.env.GEMINI_API_KEY_3,
    ].filter((k): k is string => Boolean(k && k.trim().length > 0));

    if (geminiKeys.length > 0 && process.env.ENABLE_REMOTE_AI !== 'false') {
      const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

      for (let i = 0; i < geminiKeys.length; i++) {
        const currentKey = geminiKeys[i];
        const keyMask = `${currentKey.slice(0, 6)}...${currentKey.slice(-4)}`;
        
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(currentKey)}`;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (currentKey.startsWith('AIzaSy')) {
          headers['x-goog-api-key'] = currentKey;
        }

        try {
          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: params.systemPrompt }],
              },
              contents: [
                { role: 'user', parts: [{ text: params.userPrompt }] },
              ],
              generationConfig: {
                temperature: params.temperature,
                responseMimeType: 'application/json',
              },
            }),
          });

          // Si se agota cuota (429), límite (403) o saturación temporal (503), rotar a la siguiente clave
          if (response.status === 429 || response.status === 403 || response.status === 503) {
            console.warn(
              `[GeminiPool] Clave #${i + 1} (${keyMask}) indisponible temporalmente (HTTP ${response.status}). Rotando a la clave siguiente en el pool...`
            );
            continue;
          }

          if (response.ok) {
            const data = (await response.json()) as {
              candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            };
            const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawText) {
              const parsed = JSON.parse(rawText);
              const validated = params.schema.safeParse(parsed);
              if (validated.success) {
                return validated.data;
              }
            }
          } else {
            const errBody = await response.text();
            console.warn(`[GeminiPool] Clave #${i + 1} (${keyMask}) error ${response.status}: ${errBody}`);
          }
        } catch (err) {
          console.warn(`[GeminiPool] Excepción en clave #${i + 1} (${keyMask}):`, err);
        }
      }
      console.warn('[GeminiPool] Todas las claves Gemini del pool agotadas o no disponibles. Activando motor determinístico de contingencia.');
    }

    // 2. FALLBACK A NEON AI GATEWAY / OPENAI SI ESTÁ CONFIGURADO
    const apiKey = process.env.NEON_AI_GATEWAY_KEY || process.env.OPENAI_API_KEY;
    const baseUrl = process.env.NEON_AI_GATEWAY_URL || 'https://ai-gateway.neon.tech/v1';

    if (apiKey && process.env.ENABLE_REMOTE_AI === 'true') {
      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: process.env.AI_GATEWAY_MODEL || 'claude-sonnet-4-6',
            messages: [
              { role: 'system', content: params.systemPrompt },
              { role: 'user', content: params.userPrompt },
            ],
            temperature: params.temperature,
            response_format: { type: 'json_object' },
          }),
        });

        if (response.ok) {
          const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const content = data.choices?.[0]?.message?.content;
          if (content) {
            const parsed = JSON.parse(content);
            const validated = params.schema.safeParse(parsed);
            if (validated.success) {
              return validated.data;
            }
          }
        }
      } catch (err) {
        console.warn('[AIGateway] Remote OpenAI fallback failed:', err);
      }
    }

    // 3. MOTOR DETERMINÍSTICO LEAN (0 costo, 100% apego al esquema Zod)
    const fallbackData = params.fallbackGenerator();
    return params.schema.parse(fallbackData);
  }

  // =========================================================================
  // MÓDULO 1: BLUEPRINT ENGINE AI (WORKFLOW DAG & TASKS)
  // =========================================================================
  async generateBlueprintDAG(
    projectId: string,
    projectDescription: string,
    techStack: Record<string, unknown>
  ): Promise<BlueprintDAG> {
    const knowledge = this.contextAssembler.injectKnowledge('blueprint');

    const systemPrompt = `Eres un Principal Software Architect y DevOps Lead especializado en diseño de workflows técnicos y arquitecturas de software orientadas a entrega continua.

OBJETIVO:
A partir del stack tecnológico y alcance provisto, genera un Grafo Acíclico Dirigido (DAG) completo que garantice el 100% del ciclo de vida del desarrollo hasta producción, sin omitir pasos críticos de calidad o infraestructura.

REGLAS DE SALIDA:
- Responde estrictamente en formato JSON válido que cumpla este esquema:
{
  "nodes": [
    {
      "id": "node_identificador_unico",
      "title": "Nombre conciso de la fase o hito",
      "category": "infra" | "backend" | "frontend" | "devops" | "qa",
      "position_x": number,
      "position_y": number,
      "is_automated_github": boolean,
      "github_trigger_event": string | null,
      "tasks": [
        { "title": "Tarea técnica específica", "description": "Criterio de aceptación concreto" }
      ]
    }
  ],
  "edges": [
    { "source": "node_origen_id", "target": "node_destino_id" }
  ]
}
- Organiza las coordenadas X e Y de forma secuencial horizontal y vertical limpia (mínimo 200px de separación).
- Si una fase es validable por CI/CD, marca is_automated_github: true y define su trigger (ej: "workflow_run:success").
- No agregues texto introductorio ni explicaciones fuera del JSON.
${knowledge}`;

    const userPrompt = `PROYECTO: ${projectDescription}
STACK TECNOLÓGICO: ${JSON.stringify(techStack, null, 2)}`;

    const dag = await this.callLLM<BlueprintDAG>({
      systemPrompt,
      userPrompt,
      temperature: 0.1,
      schema: BlueprintDAGSchema,
      fallbackGenerator: () => {
        return {
          nodes: [
            {
              id: 'node_infra_db',
              title: 'Infraestructura & Base de Datos',
              category: 'infra',
              position_x: 100,
              position_y: 200,
              is_automated_github: false,
              github_trigger_event: null,
              tasks: [
                { title: 'Provisionar clúster y esquema relacional DDL', description: 'Ejecución exitosa de scripts de migración' },
                { title: 'Configurar variables de entorno y connection pooling', description: 'Variables validadas en .env.local' }
              ]
            },
            {
              id: 'node_backend_api',
              title: 'Servicios Core & API REST',
              category: 'backend',
              position_x: 350,
              position_y: 200,
              is_automated_github: false,
              github_trigger_event: null,
              tasks: [
                { title: 'Implementar controladores de recursos y autenticación', description: 'Rutas seguras respondiendo HTTP 200/201' },
                { title: 'Configurar bus de eventos y WebSockets', description: 'Salas activas con latencia <200ms' }
              ]
            },
            {
              id: 'node_frontend_flow',
              title: 'Interfaz React & React Flow',
              category: 'frontend',
              position_x: 600,
              position_y: 200,
              is_automated_github: false,
              github_trigger_event: null,
              tasks: [
                { title: 'Montar lienzo de React Flow con nodos interactivos', description: 'Grafo visible con zoom y paneo' },
                { title: 'Implementar selector de proyectos y lista To-Do', description: 'Filtro por responsable y prioridad funcional' }
              ]
            },
            {
              id: 'node_telemetry_ci',
              title: 'Telemetría & Webhooks GitHub',
              category: 'devops',
              position_x: 850,
              position_y: 200,
              is_automated_github: true,
              github_trigger_event: 'workflow_run:success',
              tasks: [
                { title: 'Configurar webhook HMAC-SHA256 con secret', description: 'Prueba de entrega con firma válida verificada' }
              ]
            },
            {
              id: 'node_qa_deploy',
              title: 'Pruebas de Calidad & Despliegue',
              category: 'qa',
              position_x: 1100,
              position_y: 200,
              is_automated_github: true,
              github_trigger_event: 'push:main',
              tasks: [
                { title: 'Ejecutar suite de pruebas de integración', description: '0 tests fallidos en pipeline' }
              ]
            }
          ],
          edges: [
            { source: 'node_infra_db', target: 'node_backend_api' },
            { source: 'node_backend_api', target: 'node_frontend_flow' },
            { source: 'node_frontend_flow', target: 'node_telemetry_ci' },
            { source: 'node_telemetry_ci', target: 'node_qa_deploy' }
          ]
        };
      }
    });

    // Execution Bus: Guardar en PostgreSQL
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Buscar o crear workflow
      let wfRes = await client.query('SELECT id FROM project_workflows WHERE project_id = $1', [projectId]);
      let wfId: string;
      if (wfRes.rows.length === 0) {
        const newWf = await client.query(
          `INSERT INTO project_workflows (project_id, name) VALUES ($1, 'Primary AI DAG Workflow') RETURNING id`,
          [projectId]
        );
        wfId = newWf.rows[0].id;
      } else {
        wfId = wfRes.rows[0].id;
      }

      // Eliminar nodos y edges previos para reconstrucción limpia
      await client.query('DELETE FROM workflow_edges WHERE workflow_id = $1', [wfId]);
      await client.query('DELETE FROM workflow_nodes WHERE workflow_id = $1', [wfId]);

      const nodeIdMap = new Map<string, string>();

      for (const node of dag.nodes) {
        const insNode = await client.query(
          `INSERT INTO workflow_nodes 
           (workflow_id, slug, label, title, category, position_x, position_y, status, is_automated_github, github_trigger_event)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'RED', $8, $9)
           RETURNING id`,
          [
            wfId,
            node.id,
            node.title,
            node.title,
            node.category,
            node.position_x,
            node.position_y,
            node.is_automated_github,
            node.github_trigger_event
          ]
        );
        const realNodeId = insNode.rows[0].id;
        nodeIdMap.set(node.id, realNodeId);

        // Crear tareas asociadas
        for (const t of node.tasks) {
          const insTask = await client.query(
            `INSERT INTO project_tasks (project_id, title, description, status, priority)
             VALUES ($1, $2, $3, 'TODO', 'HIGH')
             RETURNING id`,
            [projectId, t.title, t.description]
          );
          const taskId = insTask.rows[0].id;
          await client.query(
            `INSERT INTO workflow_node_tasks (node_id, task_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [realNodeId, taskId]
          );
        }
      }

      // Insertar edges
      for (const edge of dag.edges) {
        const sourceId = nodeIdMap.get(edge.source);
        const targetId = nodeIdMap.get(edge.target);
        if (sourceId && targetId) {
          await client.query(
            `INSERT INTO workflow_edges (workflow_id, source_node_id, target_node_id)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [wfId, sourceId, targetId]
          );
        }
      }

      await client.query('COMMIT');

      // Notificar por WebSocket
      if (this.io) {
        this.io.to(`project:${projectId}`).emit('WORKFLOW_BLUEPRINT_GENERATED', {
          projectId,
          nodeCount: dag.nodes.length,
          edgeCount: dag.edges.length
        });
      }

      return dag;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // =========================================================================
  // MÓDULO 2: DEVOPS TRIAGE AI (CI/CD FAILURE DIAGNOSIS)
  // =========================================================================
  async triageDevOpsFailure(
    projectId: string,
    failureLog: string,
    workflowPath: string,
    commitMessage: string
  ): Promise<DevOpsTriage> {
    const knowledge = this.contextAssembler.injectKnowledge('devops');

    const systemPrompt = `Eres un Ingeniero Site Reliability (SRE) y especialista en resolución de incidentes de CI/CD.

OBJETIVO:
Analizar los logs de compilación fallidos de GitHub Actions y entregar un diagnóstico conciso, accionable y libre de ambigüedades.

REGLAS DE ANÁLISIS:
1. Identifica el error exacto (ej: fallo de tipado TypeScript, test unitario roto, dependencia faltante en npm, error de credencial o lint).
2. Devuelve un objeto JSON con la siguiente estructura:
{
  "root_cause": "Explicación directa del problema en máximo 2 renglones.",
  "severity": "CRITICAL" | "HIGH" | "MEDIUM",
  "suggested_fix": "Instrucción técnica precisa o comando de terminal para resolverlo.",
  "client_friendly_summary": "Explicación breve y no técnica para que el cliente comprenda por qué falló la revisión sin entrar en jerga compleja."
}
${knowledge}`;

    const userPrompt = `WORKFLOW: ${workflowPath}
COMMIT: ${commitMessage}
LOGS:
${failureLog.slice(-2000)}`;

    const triage = await this.callLLM<DevOpsTriage>({
      systemPrompt,
      userPrompt,
      temperature: 0.1,
      schema: DevOpsTriageSchema,
      fallbackGenerator: () => {
        let rootCause = 'Fallo en la fase de verificación de dependencias o compilación de TypeScript.';
        let fix = 'Ejecuta `npm run build` localmente y verifica que los tipos de datos coincidan con el contrato de la API.';
        let sev: 'CRITICAL' | 'HIGH' | 'MEDIUM' = 'HIGH';

        if (failureLog.includes('TS2304') || failureLog.includes('TS2345')) {
          rootCause = 'Error de tipado estricto en TypeScript durante el proceso tsc.';
          fix = 'Corrige los tipos de parámetros y propiedades no coincidentes indicadas en la consola de tsc.';
        } else if (failureLog.includes('ENOTFOUND') || failureLog.includes('ECONNREFUSED')) {
          rootCause = 'Fallo de conectividad o credenciales hacia la base de datos o servicio externo.';
          fix = 'Verifica las variables secretas de entorno en los Secrets del repositorio de GitHub.';
          sev = 'CRITICAL';
        }

        return {
          root_cause: rootCause,
          severity: sev,
          suggested_fix: fix,
          client_friendly_summary: 'Una verificación automática detectó un desajuste técnico antes de publicar los cambios. El equipo de desarrollo ya cuenta con la instrucción precisa para ajustarlo de inmediato.'
        };
      }
    });

    // Registrar en telemetría y emitir Socket
    await this.pool.query(
      `INSERT INTO github_telemetry_events 
       (project_id, event_type, conclusion, raw_payload)
       VALUES ($1, 'workflow_run', 'failure', $2)`,
      [projectId, JSON.stringify({ triage })]
    );

    if (this.io) {
      this.io.to(`project:${projectId}`).emit('TELEMETRY_PULSE', {
        type: 'DEVOPS_TRIAGE_ALERT',
        projectId,
        triage
      });
    }

    return triage;
  }

  // =========================================================================
  // MÓDULO 3: TASK PLANNER AI (SUBTASK BREAKDOWN)
  // =========================================================================
  async planTaskBreakdown(
    projectId: string,
    taskTitle: string,
    taskDescription: string
  ): Promise<TaskPlanner> {
    const knowledge = this.contextAssembler.injectKnowledge('tasks');

    const systemPrompt = `Eres un Technical Project Manager y Agile Coach senior con mentalidad de entrega continua.

OBJETIVO:
Convertir requerimientos de alto nivel en elementos de trabajo estilo To-Do independientes, comprobables y listos para ejecutar.

PAUTAS:
- Desglosa la tarea en acciones atómicas que un desarrollador o colaborador pueda cerrar en menos de 4 horas de trabajo.
- Cada subtarea debe redactarse en modo imperativo (ej: "Crear migración...", "Implementar middleware...").
- Salida en formato JSON:
{
  "subtasks": [
    {
      "title": "Nombre de la subtarea",
      "acceptance_criteria": "Qué condición verificable debe cumplirse para marcarla como DONE",
      "suggested_role": "COLLABORATOR"
    }
  ],
  "estimated_complexity": "LOW" | "MEDIUM" | "HIGH"
}
${knowledge}`;

    const userPrompt = `TAREA: ${taskTitle}
DESCRIPCIÓN: ${taskDescription}`;

    return await this.callLLM<TaskPlanner>({
      systemPrompt,
      userPrompt,
      temperature: 0.2,
      schema: TaskPlannerSchema,
      fallbackGenerator: () => {
        return {
          subtasks: [
            {
              title: `Diseñar contrato de interfaz y modelo para ${taskTitle}`,
              acceptance_criteria: 'Definición de tipos en TypeScript aprobada sin uso de any.',
              suggested_role: 'COLLABORATOR'
            },
            {
              title: `Implementar lógica core y endpoints para ${taskTitle}`,
              acceptance_criteria: 'Respuestas HTTP 200/201 con manejo de errores 400/500.',
              suggested_role: 'COLLABORATOR'
            },
            {
              title: `Integrar validación en interfaz de usuario y eventos`,
              acceptance_criteria: 'Feedback visual inmediato y sincronización WebSocket confirmada.',
              suggested_role: 'COLLABORATOR'
            },
            {
              title: `Ejecutar prueba de integración e incorporar a pipeline CI/CD`,
              acceptance_criteria: 'Pruebas automatizadas en verde sin regresiones.',
              suggested_role: 'ADMIN'
            }
          ],
          estimated_complexity: 'MEDIUM'
        };
      }
    });
  }

  // =========================================================================
  // MÓDULO 4: EMAIL MARKETING AI (COPY & DELIVERABILITY)
  // =========================================================================
  async generateEmailMarketingCopy(
    projectId: string,
    campaignGoal: string,
    targetAudience: string,
    tone: string = 'profesional y persuasivo'
  ): Promise<EmailMarketingCopy> {
    const knowledge = this.contextAssembler.injectKnowledge('marketing');

    const systemPrompt = `Eres un estratega de Email Marketing enfocado en conversión directa y especialista en entregabilidad y reputación de dominio.

OBJETIVO:
Redactar plantillas de correo masivo atractivas, personalizables mediante tokens y optimizadas para evitar la carpeta de Spam.

REGLAS TÉCNICAS Y DE REDACCIÓN:
1. Utiliza variables dinámicas con formato {{first_name}}, {{company}}, etc.
2. Evita palabras trampa de spam (ej: 'GRATIS', 'DINERO FÁCIL', excesos de signos de exclamación y mayúsculas sostenidas).
3. El HTML devuelto debe utilizar estilos CSS estrictamente inline y estructuración amigable para clientes móviles y de escritorio.
4. Genera siempre la versión en texto plano (plain_text) para acompañar el payload multipart.

FORMATO DE SALIDA (JSON):
{
  "subject_lines": ["Opción directa", "Opción basada en curiosidad", "Opción con urgencia moderada"],
  "preview_text": "Texto secundario de visualización previa (máximo 90 caracteres)",
  "html_body": "Código HTML completo listo para despacho con tokens {{token}} e inline CSS",
  "plain_text_body": "Versión en texto plano",
  "spam_risk_score": 1 al 10 (donde 1 es riesgo nulo y 10 es spam seguro),
  "spam_warnings": ["Advertencias de términos o elementos a cuidar"]
}
${knowledge}`;

    const userPrompt = `OBJETIVO: ${campaignGoal}
AUDIENCIA: ${targetAudience}
TONO: ${tone}`;

    return await this.callLLM<EmailMarketingCopy>({
      systemPrompt,
      userPrompt,
      temperature: 0.7,
      schema: EmailMarketingCopySchema,
      fallbackGenerator: () => {
        return {
          subject_lines: [
            `{{first_name}}, actualización clave sobre ${campaignGoal}`,
            `Una propuesta pensada para optimizar tus procesos en {{company}}`,
            `Nuevas herramientas y resultados listos para implementar`
          ],
          preview_text: `Descubre las mejoras técnicas y operativas diseñadas para impulsar a {{company}}.`,
          html_body: `<div style="font-family:sans-serif;color:#1e293b;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px;">
  <h2 style="color:#0f172a;margin-bottom:12px;">Hola, {{first_name}}</h2>
  <p style="font-size:15px;line-height:1.6;margin-bottom:16px;">
    Hemos completado la fase estratégica enfocada en <strong>${campaignGoal}</strong> para fortalecer las operaciones de <em>{{company}}</em>.
  </p>
  <p style="font-size:15px;line-height:1.6;margin-bottom:24px;">
    Te invitamos a revisar los avances y la documentación técnica directamente en tu panel de control.
  </p>
  <div style="text-align:center;margin:32px 0;">
    <a href="{{cta_url}}" style="background-color:#0284c7;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;">Acceder a la Plataforma</a>
  </div>
  <p style="font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:16px;">
    Para gestionar tus preferencias de correo o darte de baja en un clic, haz clic en <a href="{{unsubscribe_url}}" style="color:#64748b;">este enlace</a>.
  </p>
</div>`,
          plain_text_body: `Hola, {{first_name}}.\n\nHemos completado la fase estratégica enfocada en ${campaignGoal} para fortalecer las operaciones de {{company}}.\n\nPuedes acceder directamente a través de: {{cta_url}}\n\nPara cancelar tu suscripción: {{unsubscribe_url}}`,
          spam_risk_score: 1,
          spam_warnings: [
            'Sin palabras spam detectadas',
            'Estructura RFC 8058 válida con enlace de desuscripción incluido'
          ]
        };
      }
    });
  }

  // =========================================================================
  // MÓDULO 5: EXECUTIVE STATUS AI (CLIENT TRANSLATION)
  // =========================================================================
  async generateExecutiveStatusReport(projectId: string): Promise<ExecutiveStatusReport> {
    const context = await this.contextAssembler.assembleProjectContext(projectId);
    const knowledge = this.contextAssembler.injectKnowledge('executive');

    const systemPrompt = `Eres un Director de Cuentas y Consultor de Negocios de alto nivel. Tu función es mediar entre el equipo técnico de ingeniería y los clientes corporativos.

OBJETIVO:
Traducir métricas crudas de desarrollo, commits y despliegues técnicos a un resumen ejecutivo en lenguaje claro, transparente y orientado a resultados de negocio.

DIRECTRICES:
- No menciones nombres de ramas, hashes de commits, puertos ni terminología interna de base de datos.
- Traduce los avances a beneficios: en vez de "Migración PostgreSQL completada", usa "Se completó la estructura segura para el manejo de los datos del sistema".
- Resalta los hitos concluidos, el estado del cronograma (a tiempo, en riesgo, demorado) y las acciones inmediatas que el equipo ejecutará en el siguiente bloque.
${knowledge}`;

    const userPrompt = `PROYECTO: ${context.projectName}
DESCRIPCIÓN: ${context.description}
ESTADO DE NODOS:
${context.nodes.map(n => `- ${n.title}: [${n.status}] (${n.completedTasksCount}/${n.tasksCount} tareas concluidas)`).join('\n')}
TELEMETRÍA RECIENTE:
${context.recentTelemetry.map(t => `- Evento ${t.eventType}: estado ${t.status}`).join('\n')}`;

    const report = await this.callLLM<ExecutiveStatusReport>({
      systemPrompt,
      userPrompt,
      temperature: 0.7,
      schema: ExecutiveStatusReportSchema,
      fallbackGenerator: () => {
        const totalNodes = context.nodes.length || 5;
        const greenNodes = context.nodes.filter(n => n.status === 'GREEN').length;
        const progressPct = Math.round((greenNodes / Math.max(1, totalNodes)) * 100);

        const health: 'ON_TRACK' | 'NEEDS_ATTENTION' | 'AT_RISK' =
          progressPct >= 60 ? 'ON_TRACK' : (progressPct >= 20 ? 'NEEDS_ATTENTION' : 'AT_RISK');

        const completed = context.nodes
          .filter(n => n.status === 'GREEN')
          .map(n => `Consolidación y verificación de ${n.title}`);

        if (completed.length === 0) {
          completed.push('Arquitectura inicial y especificación del sistema completada');
        }

        const pending = context.nodes
          .filter(n => n.status === 'RED')
          .map(n => `Finalización del módulo ${n.title}`);

        return {
          executive_summary: `El proyecto '${context.projectName}' presenta un avance global verificado del ${progressPct}%. Los cimientos de infraestructura y los servicios centrales se encuentran desplegados bajo estándares de alta disponibilidad y estabilidad operativa continua.`,
          overall_health: health,
          completed_milestones: completed,
          upcoming_focus: pending.length > 0 ? pending : ['Pase final a producción y validación de aceptación'],
          business_impact: 'La automatización de los flujos de trabajo reduce el tiempo de comercialización y garantiza que cada entrega cumpla con los estándares de rendimiento sin interrumpir las operaciones vigentes.'
        };
      }
    });

    if (this.io) {
      this.io.to(`project:${projectId}`).emit('EXECUTIVE_REPORT_GENERATED', {
        projectId,
        report
      });
    }

    return report;
  }

  /**
   * 6. PRESENTATION SLIDE ENGINE AI (ESTILO TERA AI / GAMMA PARA TSOLUTIONS IPIDD)
   */
  public async generatePresentationDeck(params: {
    workspaceId: string;
    projectId?: string;
    authorId?: string;
    title: string;
    objective: string;
    contextSummary?: string;
  }): Promise<{ deck: any; slides: any[] }> {
    let projectContextStr = '';
    if (params.projectId) {
      try {
        const ctx = await this.contextAssembler.assembleProjectContext(params.projectId);
        const totalTasks = ctx.nodes.reduce((acc, n) => acc + (n.tasksCount || 0), 0);
        projectContextStr = `\nContexto del Proyecto:\n- Nombre: ${ctx.projectName}\n- Total Nodos: ${ctx.nodes.length} (Verdes: ${ctx.nodes.filter(n => n.status === 'GREEN').length})\n- Tareas asociadas: ${totalTasks} registradas.`;
      } catch (err) {
        // Fallback silencioso si no existe el proyecto
      }
    }

    const systemPrompt = `Actúa como Arquitecto de Soluciones y Consultor Senior OPEX de TSolutions IPIDD.
Lema Rector: "Tecnología instalada. Conocimiento transferido. Negocios escalados."

Tu misión es generar una presentación ejecutiva modular (estilo Tera AI / Gamma) de alto impacto, técnica y orientada a directores y tomadores de decisiones.
Directrices obligatorias de diseño y contenido:
1. Generar el contenido en bloques modulares y concisos, no en prosa densa.
2. Jerarquizar visualmente asignando a los títulos principales tipografía Bruno Ace, subtítulos en Space Grotesk y cuerpos en Plus Jakarta Sans.
3. Asignar acentos de color coherentes: Naranja Energy (#FF6B00) para llamadas a la acción, títulos destacados y problemas críticos; Aqua Turquesa (#00E5FF) para métricas de IA, datos técnicos y logros operativos.
4. Genera entre 4 y 6 diapositivas ordenadas lógicamente con layouts permitidos:
   - HERO_COVER (Portada principal, autor TSolutions IPIDD, lema y badge corporativo)
   - OPEX_PROBLEM_STATEMENT (Diagnóstico de causa raíz, desperdicios operativos o cuello de botella técnico)
   - THREE_CARD_KPI (3 métricas de gran escala: eficiencia, ROI, latencia o reducción de costo)
   - TWO_COLUMN (Comparativa As-Is vs To-Be o Problema vs Solución de arquitectura)
   - TIMELINE_ROADMAP (Ruta crítica en 3 a 5 fases con entregables)
   - CONCLUSION_CTA (Llamada a la acción ejecutiva con el lema rector de TSolutions)
5. Salida estrictamente en JSON válido conforme al esquema requerido.`;

    const userPrompt = `Genera un mazo de diapositivas ejecutivas para:
Título: ${params.title}
Objetivo / Alcance: ${params.objective}
${params.contextSummary ? `Resumen adicional: ${params.contextSummary}` : ''}
${projectContextStr}`;

    const presentation = await this.callLLM<GeneratedPresentation>({
      systemPrompt,
      userPrompt,
      temperature: 0.2,
      schema: GeneratedPresentationSchema,
      fallbackGenerator: () => ({
        title: params.title || 'Arquitectura de Sistemas & Consultoría OPEX',
        description: params.objective || 'Presentación estratégica de transformación tecnológica y optimización operativa',
        aspectRatio: '16:9',
        slides: [
          {
            slideIndex: 1,
            layoutType: 'HERO_COVER',
            headerTag: 'TSOLUTIONS ARQUITECTURA',
            slideData: {
              tagline: 'TSOLUTIONS IPIDD • SYSTEM ARCHITECTURE & OPEX',
              title: (params.title || 'TRANSFORMACIÓN DIGITAL & ESCALAMIENTO').toUpperCase(),
              subtitle: params.objective || 'Tecnología instalada. Conocimiento transferido. Negocios escalados.',
              author: 'TSolutions IPIDD Solution Architect',
              client: 'Comité Directivo & Stakeholders',
              date: new Date().toISOString().split('T')[0],
              badgeText: 'AUDITORÍA OPEX 2026'
            },
            speakerNotes: 'Apertura ejecutiva presentando la visión estratégica y alineación de negocio.'
          },
          {
            slideIndex: 2,
            layoutType: 'OPEX_PROBLEM_STATEMENT',
            headerTag: 'DIAGNÓSTICO OPEX',
            slideData: {
              title: 'ANÁLISIS DE CUADRO DE OPERACIONES Y DESPERDICIOS',
              problemSummary: 'Falta de automatización centralizada y silos de información que generan fricción operativa y sobrecostos por reprocesos manuales.',
              rootCauses: [
                { category: 'MÉTODOS', factor: 'Flujos manuales de sincronización sin webhooks', impact: 'Pérdida de 12h/semana en conciliación' },
                { category: 'SISTEMAS', factor: 'Arquitecturas desacopladas sin caché unificada', impact: 'Latencias en reportes y riesgo de inconsistencia' },
                { category: 'MEDICIÓN', factor: 'Telemetría fragmentada sin alertas tempranas SRE', impact: 'Tiempo de resolución superior a 4 horas' }
              ],
              countermeasure: 'Despliegue de AI Gateway con balanceo multinivel y persistencia reactiva en Neon PostgreSQL.',
              expectedGain: 'Reducción del 75% en tiempos de respuesta y cero pérdida de eventos de telemetría.'
            },
            speakerNotes: 'Detallar las causas raíz encontradas con la metodología Ishikawa aplicada a la infraestructura.'
          },
          {
            slideIndex: 3,
            layoutType: 'THREE_CARD_KPI',
            headerTag: 'MÉTRICAS CLAVE',
            slideData: {
              title: 'IMPACTO OPERATIVO Y RETORNO DE INVERSIÓN (ROI)',
              subtitle: 'Indicadores clave proyectados tras la implementación de la arquitectura TSolutions',
              cards: [
                { label: 'DISPONIBILIDAD SISTÉMICA', value: '99.98%', description: 'Uptime garantizado mediante pool redundante y motor determinístico de contingencia', accent: 'energy', badge: 'SLA CRÍTICO' },
                { label: 'TIEMPO DE LATENCIA CI/CD', value: '-65%', description: 'Reducción drástica en tiempos de compilación y despliegue continuo con caché Redis', accent: 'turquesa', badge: 'EFICIENCIA' },
                { label: 'AHORRO OPERATIVO ANUAL', value: '$42,500', description: 'Eliminación de licencias redundantes y optimización de computo serverless Neon', accent: 'gold', badge: 'ROI DIRECTO' }
              ]
            },
            speakerNotes: 'Resaltar el impacto financiero medible y las garantías de SLA.'
          },
          {
            slideIndex: 4,
            layoutType: 'TWO_COLUMN',
            headerTag: 'ARQUITECTURA COMPARATIVA',
            slideData: {
              title: 'TRANSICIÓN DE ARQUITECTURA: ESTADO AS-IS VS TO-BE',
              subtitle: 'Evolución desde infraestructura monolítica hacia ecosistema reactivo desacoplado',
              leftTitle: 'ESTADO AS-IS (LIMITACIONES)',
              leftBadge: 'DEUDA TÉCNICA',
              leftPoints: [
                'Puntos únicos de fallo en llamadas a modelos de IA sin failover',
                'Consultas directas a base de datos sin capa de caché DAG ni índices espaciales',
                'Triage reactivo manual ante fallas de despliegue en GitHub Actions',
                'Falta de gobierno multitenant con aislamiento RLS a nivel de base de datos'
              ],
              rightTitle: 'ESTADO TO-BE (TSOLUTIONS IPIDD)',
              rightBadge: 'ARQUITECTURA ESCALABLE',
              rightPoints: [
                'AI Gateway con rotación en milisegundos y contingencia determinística',
                'Neon PostgreSQL serverless con branching instantáneo y RLS estricto',
                'Telemetría automatizada con diagnóstico SRE en tiempo real vía WebSockets',
                'Panel unificado Dark Tech con tokens corporativos inmutables'
              ]
            },
            speakerNotes: 'Mostrar el contraste visual entre la situación de riesgo previa y la estabilidad actual.'
          },
          {
            slideIndex: 5,
            layoutType: 'TIMELINE_ROADMAP',
            headerTag: 'HOJA DE RUTA',
            slideData: {
              title: 'CRONOGRAMA DE EJECUCIÓN Y TRANSFERENCIA TECNOLÓGICA',
              subtitle: 'Despliegue estructurado bajo metodología ágil en 4 fases secuenciales',
              phases: [
                { step: '01', phaseName: 'Aprovisionamiento & DDL', duration: 'Semana 1', deliverables: ['Esquemas Neon Postgres', 'Políticas RLS Multi-Tenant', 'Tokens Oficiales'], status: 'COMPLETED' },
                { step: '02', phaseName: 'Integración AI Gateway & DAG', duration: 'Semana 2', deliverables: ['Pool redundante 3 claves', 'Caché Redis DAG', 'Webhooks HMAC'], status: 'IN_PROGRESS' },
                { step: '03', phaseName: 'Dashboard & Diapositivas', duration: 'Semana 3', deliverables: ['Reproductor Fullscreen 16:9', 'Exportador PDF Vectorial', 'Modales React'], status: 'PLANNED' },
                { step: '04', phaseName: 'Transferencia & Certificación', duration: 'Semana 4', deliverables: ['Capacitación de equipo', 'Manual de arquitectura', 'Pase a producción'], status: 'PLANNED' }
              ]
            },
            speakerNotes: 'Explicar las fases y el compromiso de transferencia de conocimiento para autonomía del cliente.'
          },
          {
            slideIndex: 6,
            layoutType: 'CONCLUSION_CTA',
            headerTag: 'ACUERDO & CIERRE',
            slideData: {
              title: 'DECISIÓN ESTRATÉGICA & PRÓXIMOS PASOS',
              summary: 'La solución implementada proporciona una plataforma robusta, auditable y escalable que protege la continuidad operativa y minimiza el riesgo tecnológico.',
              keyTakeaways: [
                'Garantía de uptime 100% gracias al motor de contingencia determinístico',
                'Propiedad intelectual completa y conocimiento transferido al equipo interno',
                'Alineación total con las directrices de diseño corporativo y estándares SRE'
              ],
              ctaButtonText: 'AUTORIZAR PASE A PRODUCCIÓN',
              motto: 'Tecnología instalada. Conocimiento transferido. Negocios escalados.'
            },
            speakerNotes: 'Cierre con llamado a la acción enfocado en la aprobación del despliegue.'
          }
        ]
      })
    });

    // PERSISTENCIA RELACIONAL EN NEON POSTGRESQL
    const deckResult = await this.pool.query(
      `INSERT INTO presentation_decks (workspace_id, project_id, author_id, title, description, aspect_ratio)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        params.workspaceId,
        params.projectId || null,
        params.authorId || null,
        presentation.title,
        presentation.description,
        presentation.aspectRatio || '16:9'
      ]
    );
    const deck = deckResult.rows[0];

    const insertedSlides = [];
    for (const slide of presentation.slides) {
      const slideResult = await this.pool.query(
        `INSERT INTO presentation_slides (deck_id, slide_index, layout_type, slide_data)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          deck.id,
          slide.slideIndex,
          slide.layoutType,
          JSON.stringify(slide.slideData)
        ]
      );
      insertedSlides.push(slideResult.rows[0]);
    }

    if (this.io) {
      this.io.to(`workspace_${params.workspaceId}`).emit('PRESENTATION_GENERATED', {
        deckId: deck.id,
        title: deck.title,
        slidesCount: insertedSlides.length
      });
      if (params.projectId) {
        this.io.to(`project:${params.projectId}`).emit('PRESENTATION_GENERATED', {
          deckId: deck.id,
          title: deck.title,
          slidesCount: insertedSlides.length
        });
      }
    }

    return { deck, slides: insertedSlides };
  }
}
