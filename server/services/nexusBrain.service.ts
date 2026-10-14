import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { withWorkspaceClient, DEFAULT_WORKSPACE_ID } from '../middleware/workspace.middleware';
import { EmbeddingService } from './embedding.service';

export interface ActionCard {
  id: string;
  title: string;
  label: string;
  description: string;
  actionType: 'NAVIGATE_DAG' | 'FILTER_KANBAN' | 'OPEN_ISHIKAWA' | 'OPEN_DMAIC' | 'OPEN_DOCUMENT' | 'EXECUTE_CLOSURE';
  target: string;
  targetId?: string;
  badge: string;
}

export interface NexusQueryResult {
  answer: string;
  citedProjects: string[];
  sources: Array<{
    id: string;
    projectId: string;
    projectName: string;
    domain: string;
    title: string;
    similarity: number;
    rawContent: string;
    metadata: Record<string, any>;
  }>;
  actionCards?: ActionCard[];
  similarityThresholdSatisfied: boolean;
  benchmarkSimilarity: number;
  queryLatencyMs: number;
}

export interface PreventiveIshikawaSuggestion {
  category: string;
  factorText: string;
  sourceProject: string;
  problemContext: string;
  countermeasure: string;
  similarity: number;
}

export class NexusBrainService {
  constructor(private pool: Pool, private io?: SocketIOServer) {}

  /**
   * Consulta semántica asistida por IA con RAG sobre la memoria continua de Nexus en pgvector.
   */
  public async queryNexus(
    workspaceId: string = DEFAULT_WORKSPACE_ID,
    query: string,
    minSimilarity: number = 0.75,
    domainFilter?: string
  ): Promise<NexusQueryResult> {
    const startTime = Date.now();
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      throw new Error('La consulta para Nexus no puede estar vacía.');
    }

    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      // 1. Generar el vector semántico de la consulta (1536 dimensiones)
      const queryVector = await EmbeddingService.getEmbedding(cleanQuery);
      const pgVectorStr = EmbeddingService.toPgVectorString(queryVector);

      // 2. Consulta SQL optimizada en pgvector (usando índice HNSW con vector_cosine_ops)
      let sql = `
        SELECT 
          nkv.id, 
          nkv.project_id, 
          nkv.document_id,
          nkv.chunk_index,
          nkv.knowledge_domain, 
          nkv.title, 
          nkv.raw_content, 
          nkv.metadata, 
          COALESCE(p.name, 'Documento Asimilado') as project_name,
          COALESCE(wd.filename, nkv.metadata->>'filename', 'Documento Interno') as document_filename,
          1 - (nkv.embedding <=> $1::vector) as similarity
        FROM nexus_knowledge_vectors nkv
        LEFT JOIN projects p ON nkv.project_id = p.id
        LEFT JOIN workspace_documents wd ON nkv.document_id = wd.id
        WHERE nkv.workspace_id = $2
      `;
      const params: any[] = [pgVectorStr, workspaceId];

      if (domainFilter) {
        sql += ` AND nkv.knowledge_domain = $3`;
        params.push(domainFilter);
      }

      sql += ` ORDER BY similarity DESC LIMIT 5;`;

      const searchRes = await client.query(sql, params);
      const rows = searchRes.rows;

      const latencyMs = Date.now() - startTime;

      if (rows.length === 0) {
        return {
          answer: `### 📌 Memoria Operativa de Nexus
Actualmente no se registran vectores semánticos en el workspace activo para la consulta: **"${cleanQuery}"**.

### ⚡ Recomendaciones para Iniciar
1. **Asimilar Documentos Técnicos**: Puedes cargar especificaciones, manuales de arquitectura o políticas mediante el módulo de documentos o la API de ingesta.
2. **Archivar Proyectos (Cierre Inmutable)**: Al ejecutar el cierre formal de un proyecto (\`POST /projects/:id/close\`), Nexus absorbe automáticamente el DAG de dependencias, contramedidas de Ishikawa y matrices 5W2H en su memoria continua pgvector.
3. **Consultas Disponibles**: Prueba consultando sobre arquitecturas asimiladas: *"¿Cuál es el protocolo de seguridad y arquitectura?"* o *"¿Cómo funciona el pipeline de CI/CD?"*

### 📊 Estado del Sistema
- Memoria HNSW (pgvector): Activa y sincronizada con Neon PostgreSQL.
- Tiempo de respuesta: ${latencyMs}ms.`,
          citedProjects: [],
          sources: [],
          similarityThresholdSatisfied: false,
          benchmarkSimilarity: 0,
          queryLatencyMs: latencyMs
        };
      }

      const topSimilarity = Number(rows[0].similarity || 0);
      const highAffinityMatches = rows.filter(r => Number(r.similarity) >= minSimilarity);
      const candidateMatches = highAffinityMatches.length > 0 ? highAffinityMatches : rows.slice(0, 3);

      const sources = candidateMatches.map(r => ({
        id: r.id,
        projectId: r.project_id,
        projectName: r.project_name,
        documentId: r.document_id,
        filename: r.document_filename,
        chunkIndex: r.chunk_index,
        domain: r.knowledge_domain,
        title: r.title,
        similarity: Math.round(Number(r.similarity) * 1000) / 1000,
        rawContent: r.raw_content,
        metadata: r.metadata
      }));

      const citedProjects = Array.from(new Set(sources.filter(s => !s.documentId).map(s => s.projectName)));
      const citedDocuments = Array.from(new Set(sources.filter(s => s.documentId || s.filename).map(s => s.filename)));

      // 3. Sintetizar respuesta contextual con Gemini / Neon AI Gateway o generador determinístico
      const contextBlocks = sources.map((s, idx) => {
        if (s.documentId || s.domain === 'DOCUMENT_INGESTION') {
          return `[REFERENCIA #${idx + 1} - DOCUMENTO ASIMILADO: "${s.filename}" (Parte/Sección ${s.chunkIndex || 1}, Afinidad: ${(s.similarity * 100).toFixed(1)}%)]\n${s.rawContent}`;
        }
        return `[REFERENCIA #${idx + 1} - PROYECTO ARCHIVADO: "${s.projectName}" (Dominio: ${s.domain}, Afinidad: ${(s.similarity * 100).toFixed(1)}%)]\n${s.rawContent}`;
      }).join('\n\n---\n\n');

      const systemPrompt = `Eres NORA (Nexus Orquestador de Ramas Actualizadas), la asistente virtual inteligente y humana de TSolutions IPIDD. Tu presencia y personalidad combinan calidez profesional, empatía, precisión técnica ejecutiva y la capacidad de orquestar soluciones en tiempo real.
Lema Rector de TSolutions IPIDD: "Tecnología instalada. Conocimiento transferido. Negocios escalados."

PERSONALIDAD & TRATO AL CLIENTE:
- Te comunicas como una profesional humana, amable, proactiva y segura.
- Saludas y te expresas de forma natural ("Con gusto te asisto", "Revisando nuestra memoria técnica...", "Te propongo el siguiente paso").
- Capitalizas el conocimiento histórico de la empresa y documentos asimilados en pgvector para guiar al cliente con claridad sin tecnicismos innecesarios a menos que sea un tema de ingeniería profunda.

DIRECTRICES DE RESPUESTA:
1. Responde de forma ejecutiva, fluida y estructurada en español.
2. Cita con naturalidad la fuente técnica: si es un proyecto archivado usa [Proyecto: Nombre], si es un documento asimilado usa [Documento: NombreArchivo, Sección: N].
3. Estructura tu respuesta en 3 secciones claras:
   - 📌 Diagnóstico & Aprendizaje / Evidencia Documental
   - ⚡ Recomendación Técnica & Ruta de Acción
   - 📊 Impacto & Resultados Esperados`;

      const userPrompt = `CONSULTA TÉCNICA DEL USUARIO:
${cleanQuery}

FRAGMENTOS RECUPERADOS DESDE LA MEMORIA PGVECTOR DE NEXUS:
${contextBlocks}`;

      let generatedAnswer = '';

      // Intento con Gemini Pool o Neon AI Gateway con ventana estricta de 4 a 5 segundos
      const geminiKeys = [
        process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY,
        process.env.GEMINI_API_KEY_2,
        process.env.GEMINI_API_KEY_3
      ].filter((k): k is string => Boolean(k && k.trim().length > 0));

      const synthesisDeadline = startTime + 4500; // SLO Estricto: Ventana máxima de 4.5s

      if (geminiKeys.length > 0 && process.env.ENABLE_REMOTE_AI !== 'false') {
        const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
        for (const key of geminiKeys) {
          const remainingTime = synthesisDeadline - Date.now();
          if (remainingTime <= 800) {
            // Ventana crítica consumida -> Fallback determinístico inmediato sin bloquear al operador
            break;
          }

          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), Math.min(3000, remainingTime));
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
            const resp = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                generationConfig: { temperature: 0.2 }
              })
            });
            clearTimeout(timeoutId);

            if (resp.ok) {
              const data = await resp.json() as any;
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                generatedAnswer = text;
                break;
              }
            }
          } catch (err) {
            // Siguiente clave o fallback determinístico inmediato
          }
        }
      }

      // Fallback determinístico bien estructurado si la IA remota no está activa o excede tiempo
      if (!generatedAnswer) {
        const sourceReferences = citedProjects.length > 0
          ? citedProjects.map(p => `**[Proyecto: ${p}]**`).join(', ')
          : citedDocuments.map(d => `**[Documento: ${d}]**`).join(', ');

        generatedAnswer = `
### 📌 Diagnóstico & Aprendizaje Histórico
Con base en el análisis de la memoria operativa de Nexus en pgvector, se identificaron antecedentes directos en ${sourceReferences || 'los activos técnicos asimilados'}.
Los registros confirman las especificaciones y aprendizajes transferidos para garantizar continuidad y alta disponibilidad operativa.

### ⚡ Recomendación Técnica Preventiva
Replicar las especificaciones y contramedidas validadas en la memoria técnica:
${sources.slice(0, 2).map(s => `- **${s.title}**: ${s.rawContent.split('\n')[2] || s.rawContent.substring(0, 140)}...`).join('\n')}

### 📊 Impacto & Resultados Esperados
La aplicación de estos procedimientos consolidados permite salvaguardar la confiabilidad de los despliegues, reduciendo riesgos operativos y acelerando tiempos de entrega bajo los estándares de TSolutions IPIDD: *"Tecnología instalada. Conocimiento transferido. Negocios escalados."*
        `.trim();
      }

      const actionCards = this.generateActionCards(cleanQuery, sources);

      return {
        answer: generatedAnswer,
        citedProjects,
        sources,
        actionCards,
        similarityThresholdSatisfied: topSimilarity >= minSimilarity,
        benchmarkSimilarity: topSimilarity,
        queryLatencyMs: Date.now() - startTime
      };
    });
  }

  /**
   * Genera tarjetas de acción inmediata (Action-Driven UI) según la intención del usuario y fuentes.
   */
  private generateActionCards(query: string, sources: any[]): ActionCard[] {
    const cards: ActionCard[] = [];
    const q = query.toLowerCase();

    const addCard = (card: { id: string; title: string; description: string; actionType: any; target: string; badge: string }) => {
      cards.push({
        ...card,
        label: card.title,
        targetId: card.target
      });
    };

    // 1. Detección de Nodo DAG
    if (q.includes('backend') || q.includes('api') || q.includes('servidor') || q.includes('express')) {
      addCard({
        id: 'act-dag-backend',
        title: 'Ver Nodo DAG: Backend',
        description: 'Inspeccionar dependencias y tareas del servicio backend.',
        actionType: 'NAVIGATE_DAG',
        target: 'node-backend',
        badge: 'DAG ⚡'
      });
    } else if (q.includes('base de datos') || q.includes('postgres') || q.includes('sql') || q.includes('neon') || q.includes('vector')) {
      addCard({
        id: 'act-dag-db',
        title: 'Ver Nodo DAG: Database',
        description: 'Supervisar topología y conexión agrupada en Neon PostgreSQL.',
        actionType: 'NAVIGATE_DAG',
        target: 'node-db',
        badge: 'NEON 🗄️'
      });
    } else if (q.includes('ui') || q.includes('frontend') || q.includes('pantalla') || q.includes('duo') || q.includes('mobile')) {
      addCard({
        id: 'act-dag-ui',
        title: 'Ver Nodo DAG: UI/UX',
        description: 'Revisar lienzo interactivo Mobile-First & iPhone Duo.',
        actionType: 'NAVIGATE_DAG',
        target: 'node-ui',
        badge: 'UX 📱'
      });
    } else {
      addCard({
        id: 'act-dag-core',
        title: 'Explorar Orquestador DAG',
        description: 'Verificar el flujo de dependencias reactivo y límites WIP.',
        actionType: 'NAVIGATE_DAG',
        target: 'dag-container',
        badge: 'DAG 🔗'
      });
    }

    // 2. Detección de Falla / Ishikawa / Causa Raíz
    if (q.includes('falla') || q.includes('error') || q.includes('cuello') || q.includes('problema') || q.includes('latencia') || q.includes('ishikawa')) {
      addCard({
        id: 'act-ishikawa-preventive',
        title: 'Abrir Análisis Ishikawa (6M)',
        description: 'Diagnosticar causas raíz y aplicar contramedidas operativas.',
        actionType: 'OPEN_ISHIKAWA',
        target: 'ishikawa',
        badge: 'LEAN 6σ 🐟'
      });
    }

    // 3. Detección de Tareas Kanban
    if (q.includes('tarea') || q.includes('kanban') || q.includes('wip') || q.includes('pendiente') || q.includes('progreso')) {
      addCard({
        id: 'act-kanban-wip',
        title: 'Tablero Kanban (Límites WIP)',
        description: 'Revisar tareas en curso y balancear la carga operativa.',
        actionType: 'FILTER_KANBAN',
        target: 'IN_PROGRESS',
        badge: 'KANBAN 📋'
      });
    }

    // 4. Detección de Auditoría DMAIC o Cierre
    if (q.includes('cierre') || q.includes('archiv') || q.includes('inmutable') || q.includes('snapshot')) {
      addCard({
        id: 'act-closure',
        title: 'Protocolo de Cierre Inmutable',
        description: 'Auditar peajes de entrega y sellar proyecto con SHA-256.',
        actionType: 'EXECUTE_CLOSURE',
        target: 'closure-modal',
        badge: 'CIERRE 🔒'
      });
    } else if (q.includes('peaje') || q.includes('dmaic') || q.includes('sigma') || q.includes('calidad')) {
      addCard({
        id: 'act-dmaic',
        title: 'Auditoría de Peajes DMAIC',
        description: 'Verificar avance en Definir, Medir, Analizar, Mejorar y Controlar.',
        actionType: 'OPEN_DMAIC',
        target: 'dmaic',
        badge: 'DMAIC 📊'
      });
    }

    // Si hay fuentes documentales citadas, añadir tarjeta para abrir documento
    if (sources.length > 0 && sources[0].filename) {
      addCard({
        id: 'act-doc-source',
        title: `Ver: ${sources[0].filename}`,
        description: `Inspeccionar fragmento original (Sección ${sources[0].chunkIndex || 1}).`,
        actionType: 'OPEN_DOCUMENT',
        target: sources[0].documentId || sources[0].filename,
        badge: 'DOC 📄'
      });
    }

    return cards.slice(0, 3);
  }

  /**
   * Asistencia preventiva: Al crear un diagrama de Ishikawa o iniciar un proyecto,
   * sugiere automáticamente causas raíz históricas registradas en proyectos anteriores.
   */
  public async suggestPreventiveIshikawa(
    workspaceId: string = DEFAULT_WORKSPACE_ID,
    problemStatement: string,
    category?: string
  ): Promise<PreventiveIshikawaSuggestion[]> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const queryVector = await EmbeddingService.getEmbedding(problemStatement);
      const pgVectorStr = EmbeddingService.toPgVectorString(queryVector);

      let sql = `
        SELECT 
          nkv.id, 
          nkv.project_id, 
          nkv.knowledge_domain, 
          nkv.title, 
          nkv.raw_content, 
          nkv.metadata, 
          p.name as project_name,
          1 - (nkv.embedding <=> $1::vector) as similarity
        FROM nexus_knowledge_vectors nkv
        JOIN projects p ON nkv.project_id = p.id
        WHERE nkv.workspace_id = $2
          AND nkv.knowledge_domain = 'OPEX_ROOT_CAUSE'
      `;
      const params: any[] = [pgVectorStr, workspaceId];

      if (category) {
        sql += ` AND nkv.metadata->>'category' = $3`;
        params.push(category);
      }

      sql += ` ORDER BY similarity DESC LIMIT 6;`;

      const res = await client.query(sql, params);

      return res.rows.map(r => {
        const raw = r.raw_content || '';
        const problemMatch = raw.match(/\[PROBLEMA ENFRENTADO\]:\s*([^\n]+)/);
        const causeMatch = raw.match(/\[CAUSA RAÍZ CONFIRMADA\]:\s*([^\n]+)/) || raw.match(/\[FACTOR IDENTIFICADO\]:\s*([^\n]+)/);
        const fixMatch = raw.match(/\[ACCIÓN CORRECTIVA APLICADA\]:\s*([^\n]+)/) || raw.match(/\[CONTRAMEDIDA VERIFICADA\]:\s*([^\n]+)/);

        return {
          category: r.metadata?.category || 'METHODS',
          factorText: causeMatch ? causeMatch[1].trim() : r.title,
          sourceProject: r.project_name,
          problemContext: problemMatch ? problemMatch[1].trim() : 'Problema análogo resuelto',
          countermeasure: fixMatch ? fixMatch[1].trim() : 'Estandarización y verificación preventiva',
          similarity: Math.round(Number(r.similarity) * 1000) / 1000
        };
      });
    });
  }

  /**
   * Resumen estadístico de la memoria continua de Nexus por dominio de conocimiento.
   */
  public async getNexusStats(workspaceId: string = DEFAULT_WORKSPACE_ID): Promise<any> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const countsRes = await client.query(
        `SELECT knowledge_domain, COUNT(*) as count 
         FROM nexus_knowledge_vectors 
         WHERE workspace_id = $1 
         GROUP BY knowledge_domain`,
        [workspaceId]
      );

      const totalVectors = await client.query(
        `SELECT COUNT(*) as total FROM nexus_knowledge_vectors WHERE workspace_id = $1`,
        [workspaceId]
      );

      const archivedCount = await client.query(
        `SELECT COUNT(*) as total FROM projects WHERE workspace_id = $1 AND status = 'ARCHIVED'`,
        [workspaceId]
      );

      const recentVectors = await client.query(
        `SELECT nkv.id, nkv.title, nkv.knowledge_domain, nkv.created_at, p.name as project_name
         FROM nexus_knowledge_vectors nkv
         JOIN projects p ON nkv.project_id = p.id
         WHERE nkv.workspace_id = $1
         ORDER BY nkv.created_at DESC
         LIMIT 5`,
        [workspaceId]
      );

      return {
        totalVectors: Number(totalVectors.rows[0]?.total || 0),
        archivedProjects: Number(archivedCount.rows[0]?.total || 0),
        domainBreakdown: countsRes.rows.reduce((acc: any, row: any) => {
          acc[row.knowledge_domain] = Number(row.count);
          return acc;
        }, {}),
        recentAbsorptions: recentVectors.rows
      };
    });
  }
}
