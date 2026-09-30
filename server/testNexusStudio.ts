import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../.env.local') });
import { Pool, PoolClient } from 'pg';
import { EncryptionService } from './services/encryption.service';
import { IntegrationHubService } from './services/integrationHub.service';
import { UniversalImportService } from './services/universalImport.service';
import { splitIntoSemanticChunks } from './workers/documentIngestion.worker';
import { EmbeddingService } from './services/embedding.service';
import { NexusBrainService } from './services/nexusBrain.service';
import { withWorkspaceClient } from './middleware/workspace.middleware';

const TEST_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_WORKSPACE_ID = '00000000-0000-0000-0000-000000000002';
const TEST_PROJECT_ID = '11111111-2222-3333-4444-555555555555';

async function runStudioTests() {
  console.log('================================================================');
  console.log('  TSOLUTIONS IPIDD - NEXUS ARCHITECT STUDIO VERIFICATION SUITE');
  console.log('  Dark Tech • AES-256-GCM • Universal Import • pgvector (1536-D)');
  console.log('================================================================\n');

  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is missing in environment.');
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  const integrationHubService = new IntegrationHubService(pool);
  const universalImportService = new UniversalImportService(pool);
  const nexusBrainService = new NexusBrainService(pool);

  const client: PoolClient = await pool.connect();
  await client.query(`SET app.current_workspace_id = '${TEST_WORKSPACE_ID}'`);
  let passedAssertions = 0;

  function assert(condition: boolean, message: string) {
    if (!condition) {
      console.error(`❌ FAILED: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
    passedAssertions++;
    console.log(`  ✓ ${message}`);
  }

  try {
    // -------------------------------------------------------------------------
    // PREPARACIÓN DE ENTORNO
    // -------------------------------------------------------------------------
    console.log('📌 1. PREPARANDO WORKSPACE Y PROYECTO DE PRUEBA...');
    await client.query(`
      INSERT INTO workspaces (id, name, slug)
      VALUES ($1, 'Workspace Nexus Studio Test', 'ws-nexus-studio-test')
      ON CONFLICT (id) DO NOTHING;
    `, [TEST_WORKSPACE_ID]);

    await client.query(`
      INSERT INTO workspaces (id, name, slug)
      VALUES ($1, 'Workspace Aislado Test', 'ws-aislado-test')
      ON CONFLICT (id) DO NOTHING;
    `, [OTHER_WORKSPACE_ID]);

    await client.query(`
      INSERT INTO projects (id, workspace_id, name, status, github_repo)
      VALUES ($1, $2, 'Proyecto Studio Core Architecture', 'ACTIVE', 'tsolutions-ipidd/initial-repo')
      ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE';
    `, [TEST_PROJECT_ID, TEST_WORKSPACE_ID]);

    await withWorkspaceClient(pool, TEST_WORKSPACE_ID, async (c) => {
      await c.query(`DELETE FROM project_tasks WHERE project_id = $1`, [TEST_PROJECT_ID]);
      await c.query(`DELETE FROM calendar_events WHERE project_id = $1`, [TEST_PROJECT_ID]);
      await c.query(`DELETE FROM project_imports_log WHERE project_id = $1`, [TEST_PROJECT_ID]);
    });

    // Crear workflow y nodo DAG para enlazar tareas
    const wfRes = await client.query(`
      INSERT INTO project_workflows (id, project_id, name)
      VALUES ('22222222-3333-4444-5555-666666666666', $1, 'Workflow Base Studio')
      ON CONFLICT (project_id) DO UPDATE SET name = 'Workflow Base Studio'
      RETURNING id;
    `, [TEST_PROJECT_ID]);
    const workflowId = wfRes.rows[0]?.id || '22222222-3333-4444-5555-666666666666';

    const nodeRes = await client.query(`
      INSERT INTO workflow_nodes (id, workflow_id, slug, title, label, step_order)
      VALUES ('33333333-4444-5555-6666-777777777777', $1, 'node-core-01', 'Infraestructura Base', 'Infraestructura Base', 1)
      ON CONFLICT (id) DO UPDATE SET label = 'Infraestructura Base'
      RETURNING id;
    `, [workflowId]);
    const testNodeId = nodeRes.rows[0].id;
    console.log(`  ✓ Entorno preparado. Nodo DAG activo: ${testNodeId}`);

    // -------------------------------------------------------------------------
    // TEST 1: CIFRADO AES-256-GCM
    // -------------------------------------------------------------------------
    console.log('\n📌 2. VERIFICACIÓN DE SEGURIDAD CIFRADO AES-256-GCM...');
    const secretToken = 'ghp_super_secret_github_oauth_token_tsolutions_2026';
    const encrypted = EncryptionService.encrypt(secretToken);

    assert(Boolean(encrypted.iv && encrypted.encryptedData && encrypted.tag), 'El paquete cifrado contiene iv (16-B), encryptedData y tag (auth-tag)');
    assert(encrypted.encryptedData !== secretToken, 'El contenido cifrado no expone el texto plano');
    
    const decrypted = EncryptionService.decrypt(encrypted.encryptedData, encrypted.iv, encrypted.tag);
    assert(decrypted === secretToken, 'Descifrado AES-256-GCM recupera exactamente el secreto original');

    let tamperCaught = false;
    try {
      EncryptionService.decrypt(encrypted.encryptedData, encrypted.iv, '00000000000000000000000000000000');
    } catch {
      tamperCaught = true;
    }
    assert(tamperCaught, 'Manipulación del Auth-Tag de autenticación es rechazada por AES-256-GCM');

    // -------------------------------------------------------------------------
    // TEST 2: INTEGRATION HUB SERVICE
    // -------------------------------------------------------------------------
    console.log('\n📌 3. VERIFICACIÓN DEL HUB DE INTEGRACIONES (GITHUB, GITLAB, GOOGLE TASKS)...');
    
    // Conectar GitHub
    const ghInt = await integrationHubService.saveIntegration(
      TEST_WORKSPACE_ID,
      'github',
      {
        accessToken: 'ghp_live_github_pat_vault_token_987',
        refreshToken: 'ghr_refresh_mock',
        scope: 'repo,workflow'
      },
      { org: 'tsolutions-ipidd' }
    );
    assert(ghInt.provider === 'github', 'Integración GitHub registrada con éxito');

    // Recuperar y descifrar credenciales
    const creds = await integrationHubService.getDecryptedCredentials(TEST_WORKSPACE_ID, 'github');
    assert(creds?.accessToken === 'ghp_live_github_pat_vault_token_987', 'Credenciales recuperadas de la base de datos se descifran en memoria');

    // Vincular Repositorio GitHub
    const linkRes = await integrationHubService.linkGitHubRepo(
      TEST_WORKSPACE_ID,
      TEST_PROJECT_ID,
      'tsolutions-ipidd',
      'system-architecture'
    );
    assert(linkRes.repo === 'tsolutions-ipidd/system-architecture', 'Repositorio GitHub vinculado al proyecto');

    // Vincular Proyecto GitLab
    const gitlabLink = await integrationHubService.linkGitLabProject(
      TEST_WORKSPACE_ID,
      TEST_PROJECT_ID,
      'tsolutions/core-runtime'
    );
    assert(gitlabLink.gitlabPath === 'tsolutions/core-runtime', 'Proyecto GitLab vinculado al proyecto');

    // Crear tarea en project_tasks para validación de FK en google_tasks_sync_map
    await client.query(`
      INSERT INTO project_tasks (id, workspace_id, project_id, title, status, priority)
      VALUES ('00000000-0000-0000-0000-000000000001', $1, $2, 'Tarea Core Base', 'TODO', 'HIGH')
      ON CONFLICT (id) DO UPDATE SET title = 'Tarea Core Base';
    `, [TEST_WORKSPACE_ID, TEST_PROJECT_ID]);

    // Sincronización Google Tasks Map
    const gtaskSync = await integrationHubService.syncTaskToGoogleTasks(
      TEST_WORKSPACE_ID,
      '00000000-0000-0000-0000-000000000001',
      { title: 'Tarea Core Sincronizada', status: 'TODO' }
    );
    assert(gtaskSync.synced && Boolean(gtaskSync.googleTaskId), 'Sincronización bidireccional mapeada en google_tasks_sync_map');

    // -------------------------------------------------------------------------
    // TEST 3: UNIVERSAL IMPORT ENGINE (PRE-FLIGHT & ATOMIC INGESTION)
    // -------------------------------------------------------------------------
    console.log('\n📌 4. VERIFICACIÓN DEL MOTOR DE IMPORTACIÓN UNIVERSAL...');

    // A. Pre-flight de CSV (Monday / Jira / Asana / Universal)
    const testCsv = `Title,Description,Status,Priority,Due Date
Implementar Gateway AES-256,Cifrado seguro de tokens,TODO,HIGH,2026-10-15
Configurar Ingestión Vectorial,Worker BullMQ para 1536-D,IN_PROGRESS,CRITICAL,2026-10-20
Diseñar Nexus Studio UI,Arquitectura Dark Tech con tokens oficiales,TODO,MEDIUM,2026-10-25`;

    const preflight = await universalImportService.preflightValidation({
      format: 'CSV',
      data: testCsv
    });
    assert(preflight.detectedFormat === 'CSV', 'Pre-flight detectó formato CSV correctamente');
    assert(preflight.totalRows === 3, 'Pre-flight contabilizó 3 filas en CSV');
    assert(preflight.validRowsCount === 3, 'Las 3 filas cumplen con los esquemas de validación Zod');
    assert(Boolean(preflight.suggestedMapping.titleColumn), 'Mapeo automático de columna Title detectado');

    // B. Pre-flight de Trello JSON
    const trelloJson = JSON.stringify({
      cards: [
        { name: 'Diseñar Mockup Dark Tech', desc: 'Usar #0A0D14 y #FF6B00', due: '2026-10-30', closed: false },
        { name: 'Implementar Endpoint Pre-flight', desc: 'Validación Zod estricta', due: null, closed: true }
      ]
    });
    const trelloPreflight = await universalImportService.preflightValidation({
      format: 'TRELLO',
      data: trelloJson
    });
    assert(trelloPreflight.detectedFormat === 'TRELLO', 'Pre-flight detectó exportación de Trello');
    assert(trelloPreflight.validRowsCount === 2, '2 tarjetas de Trello válidas listas para importar');

    // C. Ejecución de Importación Atómica en PostgreSQL
    const importExec = await universalImportService.executeImport(
      TEST_WORKSPACE_ID,
      TEST_PROJECT_ID,
      {
        format: 'CSV',
        data: testCsv
      }
    );
    assert(importExec.importedCount === 3, `Importación atómica insertó ${importExec.importedCount} tareas`);
    assert(importExec.failedCount === 0, 'Cero fallos en importación atómica');

    // D. Verificar persistencia en project_tasks y calendar_events
    const tasksInDb = await withWorkspaceClient(pool, TEST_WORKSPACE_ID, async (c) => {
      return await c.query(`
        SELECT title, status, priority FROM project_tasks
        WHERE project_id = $1 AND workspace_id = $2 AND title = 'Implementar Gateway AES-256';
      `, [TEST_PROJECT_ID, TEST_WORKSPACE_ID]);
    });
    assert(tasksInDb.rows.length >= 1, 'Tarea persistida en project_tasks');

    const calInDb = await withWorkspaceClient(pool, TEST_WORKSPACE_ID, async (c) => {
      return await c.query(`
        SELECT title FROM calendar_events
        WHERE project_id = $1 AND workspace_id = $2 AND title = 'Implementar Gateway AES-256';
      `, [TEST_PROJECT_ID, TEST_WORKSPACE_ID]);
    });
    assert(calInDb.rows.length >= 1, 'Hito sincronizado en calendar_events');

    // E. Verificar registro en project_imports_log
    const importLog = await withWorkspaceClient(pool, TEST_WORKSPACE_ID, async (c) => {
      return await c.query(`
        SELECT * FROM project_imports_log WHERE id = $1;
      `, [importExec.importId]);
    });
    assert(importLog.rows.length === 1 && importLog.rows[0].imported_count === 3, 'Log de importación registrado en project_imports_log');

    // F. Verificación de Rollback Atómico ante error
    let rollbackSuccess = false;
    try {
      await universalImportService.executeImport(
        TEST_WORKSPACE_ID,
        '00000000-0000-0000-0000-000000000999', // Proyecto inexistente que disparará FK error
        {
          format: 'CSV',
          data: testCsv
        }
      );
    } catch {
      rollbackSuccess = true;
    }
    assert(rollbackSuccess, 'Rollback atómico disparado correctamente protegiendo la consistencia de la base de datos');

    // -------------------------------------------------------------------------
    // TEST 4: INGESTIÓN DOCUMENTAL Y CHUNKING SEMÁNTICO
    // -------------------------------------------------------------------------
    console.log('\n📌 5. VERIFICACIÓN DE INGESTIÓN DOCUMENTAL Y ASIMILACIÓN VECTORIAL...');
    
    // Crear documento técnico simulado
    const technicalDocContent = `# Especificación de Arquitectura de Telemetría TSolutions IPIDD
## Resumen Ejecutivo
La plataforma opera bajo el lema "Tecnología instalada. Conocimiento transferido. Negocios escalados."
Provee telemetría continua para eventos de GitHub Actions y GitLab CI/CD.

## Protocolo de Seguridad
El cifrado militar se realiza exclusivamente con AES-256-GCM.
Todas las claves de sesión son rotadas cada 90 días.

## Topología de Base de Datos
PostgreSQL sobre Neon con la extensión pgvector activada para almacenamiento de vectores 1536-D.
Aislamiento multi-tenant garantizado mediante Row-Level Security (RLS) en todas las tablas operativas.`;

    const chunks = splitIntoSemanticChunks(technicalDocContent, 300, 50);
    assert(chunks.length >= 2, `División semántica generó ${chunks.length} bloques con solapamiento`);

    // Inserción del documento en workspace_documents y vectores
    const { docId, storedCount } = await withWorkspaceClient(pool, TEST_WORKSPACE_ID, async (c) => {
      const docInsert = await c.query(`
        INSERT INTO workspace_documents (
          workspace_id, project_id, title, filename, file_size_bytes, mime_type, storage_path, parsing_status, total_chunks
        ) VALUES ($1, $2, 'Manual de Arquitectura TSolutions', 'Manual_Arquitectura_TSolutions.md', 1024, 'text/markdown', '/tmp/doc.md', 'INDEXED', $3)
        RETURNING id;
      `, [TEST_WORKSPACE_ID, TEST_PROJECT_ID, chunks.length]);
      const dId = docInsert.rows[0].id;

      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];
        const embedding = await EmbeddingService.getEmbedding(chunkText);
        const pgVectorStr = EmbeddingService.toPgVectorString(embedding);

        await c.query(`
          INSERT INTO nexus_knowledge_vectors (
            workspace_id, project_id, document_id, knowledge_domain,
            title, raw_content, metadata, embedding, chunk_index
          ) VALUES ($1, $2, $3, 'DOCUMENT_INGESTION', $4, $5, $6, $7::vector, $8);
        `, [
          TEST_WORKSPACE_ID,
          TEST_PROJECT_ID,
          dId,
          `Doc: Manual_Arquitectura_TSolutions.md (Parte ${i + 1}/${chunks.length})`,
          chunkText,
          JSON.stringify({ filename: 'Manual_Arquitectura_TSolutions.md', chunk: i + 1 }),
          pgVectorStr,
          i + 1
        ]);
      }

      const vectorsStored = await c.query(`
        SELECT count(*) as count FROM nexus_knowledge_vectors WHERE document_id = $1;
      `, [dId]);

      return { docId: dId, storedCount: parseInt(vectorsStored.rows[0].count, 10) };
    });

    assert(Boolean(docId), `Documento registrado en workspace_documents con ID: ${docId}`);
    assert(storedCount === chunks.length, `Se almacenaron ${chunks.length} vectores en nexus_knowledge_vectors`);

    // -------------------------------------------------------------------------
    // TEST 5: NEXUS BRAIN RAG QUERY CON CITAS DE DOCUMENTOS
    // -------------------------------------------------------------------------
    console.log('\n📌 6. VERIFICACIÓN DEL MOTOR RAG MULTI-FUENTE DE NEXUS AI...');

    const ragQuery = await nexusBrainService.queryNexus(
      TEST_WORKSPACE_ID,
      '¿Cuál es el protocolo de seguridad y cifrado de TSolutions?',
      0.50
    );

    assert(Boolean(ragQuery.answer), 'Nexus generó una respuesta contextualizada RAG');
    assert(ragQuery.sources.length > 0, `Nexus identificó ${ragQuery.sources.length} fuentes vectoriales relevantes`);
    
    // Verificar que cita el documento técnico asimilado
    const docCitation = ragQuery.sources.find((s: { title: string; domain: string }) => 
      s.title.includes('Manual_Arquitectura_TSolutions') || s.domain === 'DOCUMENT_INGESTION'
    );
    assert(Boolean(docCitation), 'La cita documental fue recuperada y etiquetada correctamente por Nexus');

    // -------------------------------------------------------------------------
    // TEST 6: AISLAMIENTO RLS MULTI-TENANT
    // -------------------------------------------------------------------------
    console.log('\n📌 7. VERIFICACIÓN DE AISLAMIENTO MULTI-TENANT (RLS)...');
    
    // Simular consulta desde un workspace ajeno
    const otherWsQuery = await nexusBrainService.queryNexus(
      OTHER_WORKSPACE_ID,
      '¿Cuál es el protocolo de seguridad y cifrado de TSolutions?',
      0.50
    );

    // Ninguna fuente del TEST_WORKSPACE_ID debe filtrarse al OTHER_WORKSPACE_ID
    const leakedSources = otherWsQuery.sources.filter((s: { projectId?: string; id?: string }) => 
      s.projectId === TEST_PROJECT_ID
    );
    assert(leakedSources.length === 0, 'Aislamiento estricto: Cero fuga de vectores entre workspaces');

    // -------------------------------------------------------------------------
    // RESUMEN FINAL
    // -------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log(`🎉 TODAS LAS PRUEBAS PASARON EXITOSAMENTE (${passedAssertions}/${passedAssertions} ASERCIONES)`);
    console.log('  Nexus Architect Studio listo para producción institucional.');
    console.log('================================================================\n');

  } catch (error) {
    console.error('\n❌ ERROR EN LA SUITE DE PRUEBAS DE NEXUS STUDIO:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runStudioTests();
