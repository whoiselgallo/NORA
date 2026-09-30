import { Pool } from 'pg';
import path from 'path';
import dotenv from 'dotenv';
import { OrchestratorService, OrchestratorEvent } from './services/orchestrator.service';
import { DmaicService } from './services/dmaic.service';
import { TaskManagerService } from './services/taskManager.service';
import { MasterWebhookHandler } from './webhooks/master.handler';
import { DagCacheService } from './services/dagCache.service';
import { CampaignDispatcherService } from './services/campaignDispatcher.service';
import { BrandEnforcerService, TSOLUTIONS_BRAND_TOKENS } from './services/brandEnforcer.service';
import { OpexService } from './services/opex.service';
import { DEFAULT_WORKSPACE_ID } from './middleware/workspace.middleware';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, extraInfo?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} ${extraInfo ? `-> ${extraInfo}` : ''}`);
    failed++;
  }
}

async function runReactiveOrchestrationTests() {
  console.log('========================================================================');
  console.log('🚀 SUITE DE INTEGRACIÓN: ORQUESTACIÓN REACTIVA & FLUJOS ENTRE MÓDULOS');
  console.log('========================================================================\n');

  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  const emittedWsEvents: Array<{ room: string; event: string; payload: any }> = [];
  const mockIo = {
    to: (room: string) => ({
      emit: (event: string, payload: any) => {
        emittedWsEvents.push({ room, event, payload });
      }
    })
  } as any;

  const dagCache = new DagCacheService();
  const orchestrator = new OrchestratorService(pool, mockIo);
  const dmaicService = new DmaicService(pool, orchestrator);
  const taskService = new TaskManagerService(pool, mockIo, dagCache, orchestrator);
  const opexService = new OpexService(pool);
  const brandEnforcer = new BrandEnforcerService(pool);
  const campaignDispatcher = new CampaignDispatcherService(pool, mockIo, undefined, dagCache);
  const masterWebhook = new MasterWebhookHandler(pool, mockIo, dagCache, dmaicService, orchestrator, campaignDispatcher);

  const testProjectId = '77777777-8888-9999-aaaa-bbbbbbbbbbbb';

  try {
    // --------------------------------------------------------------------------
    // 0. Preparar Proyecto de Prueba
    // --------------------------------------------------------------------------
    await pool.query(
      `INSERT INTO projects (id, workspace_id, name, description, github_repo, tech_stack)
       VALUES ($1, $2, 'Orchestration Core Project', 'Enterprise Orchestration & Reactive Data Flow', 'whoiselgallo/antigravity-instruction-architect', $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [testProjectId, DEFAULT_WORKSPACE_ID, JSON.stringify({ frontend: 'React', backend: 'Node', cloud: 'AWS' })]
    );

    // --------------------------------------------------------------------------
    // 1. BUS CENTRAL DE EVENTOS (orchestrator.service.ts)
    // --------------------------------------------------------------------------
    console.log('📌 1. SERVICIO CENTRAL DE ORQUESTACIÓN Y BUS DE EVENTOS');

    let receivedBusEvent: any = null;
    orchestrator.on('TEST_BUS_EVENT', (evt) => {
      receivedBusEvent = evt;
    });

    const testEvent: OrchestratorEvent = {
      event_type: 'TEST_BUS_EVENT',
      workspace_id: DEFAULT_WORKSPACE_ID,
      project_id: testProjectId,
      entity_id: 'sample-entity',
      payload: { status: 'INITIALIZED', score: 100 },
      timestamp: new Date().toISOString()
    };

    await orchestrator.emitEvent(testEvent);

    assert(receivedBusEvent !== null, 'Bus de eventos recibe y despacha evento');
    const busEvt = receivedBusEvent as unknown as OrchestratorEvent;
    assert(
      busEvt.event_type === 'TEST_BUS_EVENT' &&
      busEvt.workspace_id === DEFAULT_WORKSPACE_ID,
      'Firma de evento unificado con workspace_id, project_id, entity_id y timestamp'
    );
    assert(
      emittedWsEvents.some(e => e.room === `workspace_${DEFAULT_WORKSPACE_ID}` && e.event === 'TEST_BUS_EVENT'),
      'Evento propagado vía WebSockets a la sala workspace_WORKSPACE_ID'
    );

    // --------------------------------------------------------------------------
    // 2. FLUJO DE GÉNESIS: DMAIC DEFINE -> BLUEPRINT DAG -> TO-DO / GANTT / KANBAN
    // --------------------------------------------------------------------------
    console.log('\n📌 2. FLUJO DE GÉNESIS: DMAIC DEFINE -> BLUEPRINT DAG -> TAREAS & CALENDARIO');

    // Inicializar fases DMAIC
    const dmaicPhases = await dmaicService.initializeProjectDmaic(DEFAULT_WORKSPACE_ID, testProjectId, {
      problemStatement: 'Latencia y cuellos de botella en el despacho de campañas.',
      businessCase: 'Automatización total para escalar a 50k envíos con 0 defectos.',
      goal: 'Integración CI/CD y telemetría en tiempo real.',
      scope: 'Arquitectura completa de punta a punta.'
    });
    assert(dmaicPhases.length === 5, '5 fases DMAIC inicializadas (Define, Measure, Analyze, Improve, Control)');

    // Aprobar Tollgate DEFINE
    const approveResult = await dmaicService.approveTollgate(DEFAULT_WORKSPACE_ID, testProjectId, 'DEFINE');
    assert(approveResult.phase.tollgate_status === 'APPROVED', 'Tollgate DEFINE aprobado exitosamente');
    assert(Boolean(approveResult.blueprint), 'Blueprint DAG generado automáticamente al aprobar DEFINE');
    assert((approveResult.blueprint?.taskCount || 0) > 0, 'Tareas técnicas generadas en project_tasks');

    // Verificar que las tareas se sincronizaron con calendar_events
    const calEventsRes = await pool.query(
      `SELECT * FROM calendar_events WHERE project_id = $1 AND workspace_id = $2`,
      [testProjectId, DEFAULT_WORKSPACE_ID]
    );
    assert(calEventsRes.rows.length >= (approveResult.blueprint?.taskCount || 1), 'Fechas objetivo sincronizadas en calendar_events');

    // --------------------------------------------------------------------------
    // 3. FLUJO DE EJECUCIÓN UNIFICADA (SINGLE SOURCE OF TRUTH & TRANSICIÓN BINARIA)
    // --------------------------------------------------------------------------
    console.log('\n📌 3. FLUJO DE EJECUCIÓN UNIFICADA & TRANSICIONES DE ESTADO');

    // Obtener tareas del primer nodo
    const nodesRes = await pool.query(
      `SELECT wn.id, wn.slug, COUNT(pt.id) as task_count
       FROM workflow_nodes wn
       JOIN workflow_node_tasks wnt ON wnt.node_id = wn.id
       JOIN project_tasks pt ON pt.id = wnt.task_id
       WHERE wn.workflow_id = $1
       GROUP BY wn.id, wn.slug
       ORDER BY wn.id ASC`,
      [approveResult.blueprint!.workflowId]
    );

    const firstNode = nodesRes.rows[0];
    const nodeTasksRes = await pool.query(
      `SELECT pt.id, pt.title, pt.status FROM workflow_node_tasks wnt
       JOIN project_tasks pt ON wnt.task_id = pt.id
       WHERE wnt.node_id = $1`,
      [firstNode.id]
    );

    // Mover la primera tarea a IN_PROGRESS (debe mapear a columna 'En Desarrollo' pos 1)
    const task1 = nodeTasksRes.rows[0];
    await taskService.updateTaskStatus(task1.id, 'IN_PROGRESS', 'ADMIN', DEFAULT_WORKSPACE_ID);

    const task1After = await pool.query(`SELECT * FROM project_tasks WHERE id = $1`, [task1.id]);
    assert(task1After.rows[0].status === 'IN_PROGRESS', 'Tarea actualizada a IN_PROGRESS');
    assert(Boolean(task1After.rows[0].kanban_column_id), 'Tarea proyectada a columna de Kanban');

    // Completar todas las tareas del nodo para disparar transición a GREEN
    for (const t of nodeTasksRes.rows) {
      await taskService.updateTaskStatus(t.id, 'DONE', 'ADMIN', DEFAULT_WORKSPACE_ID);
    }

    const nodeAfter = await pool.query(`SELECT status FROM workflow_nodes WHERE id = $1`, [firstNode.id]);
    assert(nodeAfter.rows[0].status === 'GREEN', 'Nodo pasa a GREEN cuando el 100% de sus tareas están DONE');

    // --------------------------------------------------------------------------
    // 4. BUCLE OPEX: FALLOS CONSECUTIVOS -> ANÁLISIS CAUSAL -> ACCIÓN CORRECTIVA
    // --------------------------------------------------------------------------
    console.log('\n📌 4. BUCLE DE SOLUCIÓN DE PROBLEMAS OPEX & ACCIÓN CORRECTIVA');

    const draftRes = await dmaicService.triggerCausalAnalysisDraft(DEFAULT_WORKSPACE_ID, testProjectId, {
      title: 'Fallo recurrente en validación de schema de webhook',
      problemStatement: 'Rechazo de payload debido a formato de timestamp no normalizado.',
      suspectedCategory: 'METHODS',
      commit_sha: 'a1b2c3d4'
    });

    assert(Boolean(draftRes.ishikawaId), 'Borrador de diagrama Ishikawa creado en fase ANALYZE');
    assert(Boolean(draftRes.fiveWhysId), 'Borrador de 5 Porqués generado con causa raíz identificada');

    // Crear acción correctiva formal conectada al nodo fallido
    const correctiveAction = await opexService.createCorrectiveAction(DEFAULT_WORKSPACE_ID, testProjectId, {
      title: 'Normalizar timestamps en entrada de webhooks',
      description: 'Implementar coerce a z.string().datetime() en esquemas Zod.',
      failedNodeId: firstNode.id,
      fiveWhysId: draftRes.fiveWhysId
    });

    assert(correctiveAction.priority === 'CRITICAL', 'Acción correctiva creada con prioridad CRITICAL');
    assert(Boolean(correctiveAction.start_date && correctiveAction.due_date), 'Acción correctiva registrada en cronograma de Gantt');

    // --------------------------------------------------------------------------
    // 5. OBSERVABILIDAD TÉCNICA: GITHUB ACTIONS -> CONTROL DMAIC
    // --------------------------------------------------------------------------
    console.log('\n📌 5. OBSERVABILIDAD: GITHUB ACTIONS TELEMETRÍA -> FASE CONTROL DMAIC');

    const telemetryRes = await dmaicService.ingestControlTelemetry(DEFAULT_WORKSPACE_ID, testProjectId, {
      duration_ms: 45000,
      conclusion: 'success',
      commit_sha: 'cafe12345678',
      branch: 'main'
    });

    assert(telemetryRes.isCompliant === true, 'Métrica de telemetría cumple con tolerancias del Plan de Control');
    assert(telemetryRes.movingSuccessRate >= 95, 'Tasa de éxito superior al umbral mínimo del 95%');

    // --------------------------------------------------------------------------
    // 6. FLUJO DE MERCADOTECNIA: DEPLOY GREEN -> CAMPAIGN DISPATCH
    // --------------------------------------------------------------------------
    console.log('\n📌 6. MERCADOTECNIA: DEPLOY GREEN -> DESBLOQUEO & ACTIVACIÓN');

    // Crear audiencia, contacto, plantilla y campaña bloqueada
    const audRes = await pool.query(
      `INSERT INTO marketing_audiences (workspace_id, project_id, name)
       VALUES ($1, $2, 'Audiencia Beta') RETURNING id`,
      [DEFAULT_WORKSPACE_ID, testProjectId]
    );
    const tmplRes = await pool.query(
      `INSERT INTO marketing_templates (workspace_id, project_id, name, subject, html_body)
       VALUES ($1, $2, 'Bienvenida', 'Lanzamiento Exitoso', '<p>Hola {{first_name}}</p>') RETURNING id`,
      [DEFAULT_WORKSPACE_ID, testProjectId]
    );
    const campRes = await pool.query(
      `INSERT INTO marketing_campaigns (workspace_id, project_id, template_id, audience_id, name, status, is_blocked)
       VALUES ($1, $2, $3, $4, 'Campaña Lanzamiento Beta', 'DRAFT', true) RETURNING id`,
      [DEFAULT_WORKSPACE_ID, testProjectId, tmplRes.rows[0].id, audRes.rows[0].id]
    );
    const campaignId = campRes.rows[0].id;

    // Simular que todos los nodos pasan a GREEN
    await pool.query(
      `UPDATE workflow_nodes SET status = 'GREEN' WHERE workflow_id = $1`,
      [approveResult.blueprint!.workflowId]
    );

    // Disparar Webhook Master con CI_CD_EXECUTION exitoso
    let masterCode = 0;
    let masterData: any = null;
    const reqMock: any = {
      params: { routingKey: 'github-ci-cd' },
      body: {
        event: 'CI_CD_EXECUTION',
        commit_sha: 'deadbeef1234',
        branch: 'main',
        author: 'Antigravity Architect',
        workflow_status: 'success',
        phases_detail: [{ name: 'deploy', status: 'success' }],
        timestamp: new Date().toISOString(),
        projectId: testProjectId,
        workspaceId: DEFAULT_WORKSPACE_ID
      }
    };
    const resMock: any = {
      status: (code: number) => {
        masterCode = code;
        return { json: (d: any) => { masterData = d; } };
      }
    };

    await masterWebhook.handleMasterWebhook(reqMock, resMock);
    assert(masterCode === 200, 'Webhook Master procesa ejecución CI/CD');

    const updatedCamp = await pool.query(`SELECT status, is_blocked FROM marketing_campaigns WHERE id = $1`, [campaignId]);
    assert(updatedCamp.rows[0].status === 'PROCESSING', 'Campaña desbloqueada y activada a PROCESSING ante DEPLOY GREEN');
    assert(updatedCamp.rows[0].is_blocked === false, 'Flag is_blocked removido');

    // --------------------------------------------------------------------------
    // 7. COMPILADOR DE ENTREGABLES TSOLUTIONS IPIDD (TOKENS OFICIALES)
    // --------------------------------------------------------------------------
    console.log('\n📌 7. COMPILADOR DE ENTREGABLES & PRESENTACIONES TSOLUTIONS IPIDD');

    const deliverable = await brandEnforcer.compileProjectDeliverable(DEFAULT_WORKSPACE_ID, testProjectId);
    assert(Boolean(deliverable.deck.id), 'Mazo de diapositivas creado en presentation_decks');
    assert(deliverable.slides.length === 7, 'Generadas exactamente 7 diapositivas 16:9 del ciclo DMAIC');

    // Validar tokens corporativos en diapositivas
    const heroSlide = deliverable.slides.find(s => s.layout_type === 'HERO_COVER');
    assert(heroSlide?.slide_data?.tagline === TSOLUTIONS_BRAND_TOKENS.watermark, 'Marca de agua oficial TSOLUTIONS IPIDD presente');
    assert(heroSlide?.slide_data?.motto === TSOLUTIONS_BRAND_TOKENS.corporateMotto, 'Lema corporativo presente en portada');
    assert(deliverable.brandTokens.colors.background === '#0A0D14', 'Color de fondo Negro Profundo #0A0D14 verificado');
    assert(deliverable.brandTokens.colors.primaryAccent === '#FF6B00', 'Acento Naranja Energy #FF6B00 verificado');
    assert(deliverable.brandTokens.colors.techAccent === '#00E5FF', 'Acento Aqua Turquesa #00E5FF verificado');
    assert(deliverable.brandTokens.typography.titles === 'Bruno Ace', 'Tipografía Bruno Ace para títulos');
    assert(deliverable.brandTokens.typography.subtitles === 'Space Grotesk', 'Tipografía Space Grotesk para subtítulos');

    console.log('\n========================================================================');
    console.log(`🏁 RESULTADOS: ${passed} PRUEBAS PASADAS, ${failed} FALLIDAS`);
    console.log('========================================================================');

    await dagCache.close();
    await orchestrator.close();
    await campaignDispatcher.getQueue().close();

    if (failed > 0) process.exit(1);
  } catch (err: unknown) {
    console.error('Error in Orchestration test suite:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runReactiveOrchestrationTests();
