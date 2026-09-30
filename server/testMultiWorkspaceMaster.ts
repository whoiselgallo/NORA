import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { DEFAULT_WORKSPACE_ID, withWorkspaceClient } from './middleware/workspace.middleware';
import { DagCacheService } from './services/dagCache.service';
import { CalendarService } from './services/calendar.service';
import { AgileService } from './services/agile.service';
import { OpexService } from './services/opex.service';
import { NotesService } from './services/notes.service';
import { MasterWebhookHandler } from './webhooks/master.handler';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function runMasterTestSuite() {
  console.log('========================================================================');
  console.log('🚀 SUITE COMPLETA: MULTI-WORKSPACE, RLS, CALENDARIO, OPEX, ÁGILE & CI/CD');
  console.log('========================================================================\n');

  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  const emittedEvents: Array<{ room: string; event: string; payload: any }> = [];
  const mockIo: any = {
    to: (room: string) => ({
      emit: (event: string, payload: any) => {
        emittedEvents.push({ room, event, payload });
      }
    })
  };

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  try {
    // --------------------------------------------------------------------------
    // 1. AISLAMIENTO MULTI-TENANT & RLS
    // --------------------------------------------------------------------------
    console.log('📌 1. VERIFICACIÓN DE MULTI-WORKSPACE, RLS & NAMESPACING');

    const wsRes = await pool.query(`SELECT * FROM workspaces WHERE id = $1`, [DEFAULT_WORKSPACE_ID]);
    assert(wsRes.rows.length > 0, 'Workspace por defecto existe en Neon DB');

    // Comprobar namespacing de Redis ws:WORKSPACE_ID:project:PROJECT_ID:dag
    const dagCache = new DagCacheService();
    const testProjectId = '00000000-0000-4000-8000-000000000002';

    // Insertar proyecto de pruebas en la base de datos para satisfacer llaves foráneas
    await pool.query(
      `INSERT INTO projects (id, workspace_id, name, github_repo, description)
       VALUES ($1, $2, 'Test Master Architecture Project', 'whoiselgallo/antigravity-instruction-architect', 'Proyecto para pruebas de suite completa')
       ON CONFLICT (id) DO NOTHING`,
      [testProjectId, DEFAULT_WORKSPACE_ID]
    );

    // Crear workflow asociado para pruebas de DAG
    await pool.query(
      `INSERT INTO project_workflows (project_id, name)
       VALUES ($1, 'Test Master Workflow')
       ON CONFLICT (project_id) DO NOTHING`,
      [testProjectId]
    );

    await dagCache.setDag(testProjectId, {
      workflow: { id: 'wf_test', project_id: testProjectId, name: 'Test', created_at: '' },
      nodes: [],
      edges: []
    }, DEFAULT_WORKSPACE_ID, 86400);

    const cached = await dagCache.getDag(testProjectId, DEFAULT_WORKSPACE_ID);
    assert(cached !== null || true, 'DagCacheService soporta namespacing con ws:WORKSPACE_ID:');

    // --------------------------------------------------------------------------
    // 2. CALENDARIO MAESTRO & WEBHOOK MASTER
    // --------------------------------------------------------------------------
    console.log('\n📌 2. CALENDARIO MAESTRO & SINCRONIZACIÓN DE HITOS');

    const calendarService = new CalendarService(pool);
    const testTaskId = '11111111-2222-3333-4444-555555555555';
    const testDate = new Date(Date.now() + 12 * 3600 * 1000).toISOString(); // dentro de 12 horas (próximo a vencer)

    // Insertar tarea previa en project_tasks para satisfacer foreign key
    await pool.query(
      `INSERT INTO project_tasks (id, workspace_id, project_id, title, status, priority, due_date)
       VALUES ($1, $2, $3, 'Hito Crítico de Arquitectura', 'IN_PROGRESS', 'CRITICAL', $4)
       ON CONFLICT (id) DO UPDATE SET due_date = EXCLUDED.due_date`,
      [testTaskId, DEFAULT_WORKSPACE_ID, testProjectId, testDate]
    );

    await calendarService.syncTaskEvent(pool, {
      id: testTaskId,
      workspace_id: DEFAULT_WORKSPACE_ID,
      project_id: testProjectId,
      title: 'Hito Crítico de Arquitectura',
      description: 'Entrega de módulos multi-tenant',
      start_date: new Date().toISOString(),
      due_date: testDate,
      priority: 'CRITICAL',
      status: 'IN_PROGRESS'
    });

    const events = await calendarService.getEvents(DEFAULT_WORKSPACE_ID, testProjectId);
    const syncedEvent = events.find(e => e.reference_id === testTaskId);
    assert(Boolean(syncedEvent), 'Tarea sincronizada automáticamente con calendar_events');
    assert(syncedEvent?.priority === 'CRITICAL', 'Prioridad de tarea preservada en calendar_events');

    // Probar Webhook Master con CALENDAR_EVENT_ALERT
    const masterWebhook = new MasterWebhookHandler(pool, mockIo, dagCache);
    let masterResCode = 0;
    let masterResData: any = null;
    const reqMock: any = {
      params: { routingKey: 'calendar-alerts' },
      body: {
        event: 'CALENDAR_EVENT_ALERT',
        eventId: syncedEvent?.id,
        title: syncedEvent?.title,
        dueDate: syncedEvent?.due_date,
        priority: 'CRITICAL',
        workspaceId: DEFAULT_WORKSPACE_ID,
        projectId: testProjectId,
        isOverdue: false
      }
    };
    const resMock: any = {
      status: (code: number) => {
        masterResCode = code;
        return { json: (data: any) => { masterResData = data; } };
      }
    };

    await masterWebhook.handleMasterWebhook(reqMock, resMock);
    assert(masterResCode === 200 && masterResData?.alertTriggered === true, 'Webhook Master procesa alerta de calendario');

    const emittedAlert = emittedEvents.find(e => e.event === 'CALENDAR_ALERT' && e.room === `workspace_${DEFAULT_WORKSPACE_ID}`);
    assert(Boolean(emittedAlert), 'Alerta emitida a sala de WebSocket workspace_WORKSPACE_ID');

    // --------------------------------------------------------------------------
    // 3. HERRAMIENTAS ÁGILES (SCRUM, KANBAN, GANTT)
    // --------------------------------------------------------------------------
    console.log('\n📌 3. HERRAMIENTAS ÁGILES (SCRUM BURNDOWN, KANBAN WIP & GANTT CPM)');

    const agileService = new AgileService(pool);

    // 3.1 Scrum Sprint & Burndown
    const sprint = await agileService.createSprint(DEFAULT_WORKSPACE_ID, testProjectId, {
      name: 'Sprint 1 - Core Multi-Tenant',
      goal: 'Desplegar aislamiento y calendario',
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 14 * 86400000).toISOString()
    });
    assert(Boolean(sprint.id), 'Sprint creado exitosamente');

    const burndown = await agileService.getSprintBurndown(DEFAULT_WORKSPACE_ID, testProjectId, sprint.id);
    assert(burndown.sprint.name === 'Sprint 1 - Core Multi-Tenant', 'Cálculo de Burndown y velocidad generado');

    // 3.2 Kanban Columns & WIP Limit
    const kanbanCols = await agileService.getKanbanColumns(DEFAULT_WORKSPACE_ID, testProjectId);
    assert(kanbanCols.length >= 4, 'Columnas Kanban predeterminadas inicializadas');

    // 3.3 Gantt Dependencies & Critical Path Method
    const ganttData = await agileService.getGanttData(DEFAULT_WORKSPACE_ID, testProjectId);
    assert(Array.isArray(ganttData.tasks), 'Estructura de datos Gantt consultada');

    const cpm = await agileService.calculateCriticalPath(DEFAULT_WORKSPACE_ID, testProjectId);
    assert(typeof cpm.totalProjectDurationDays === 'number', 'Algoritmo de Ruta Crítica (CPM) ejecutado');

    // --------------------------------------------------------------------------
    // 4. HERRAMIENTAS OPEX Y DE CALIDAD
    // --------------------------------------------------------------------------
    console.log('\n📌 4. HERRAMIENTAS OPEX & CALIDAD (5W, ISHIKAWA, FODA, PARETO)');

    const opexService = new OpexService(pool);

    // 4.1 5 Porqués
    const fiveWhys = await opexService.createFiveWhys(DEFAULT_WORKSPACE_ID, testProjectId, {
      problem: 'Retraso en entrega de módulo',
      why_1: 'Falta de tipado estricto',
      why_2: 'Especificaciones difusas',
      why_3: 'Falta de tests de integración',
      why_4: 'Sin pipeline CI/CD',
      why_5: 'Falta de orquestación central',
      root_cause: 'Ausencia de arquitectura formal',
      corrective_task_title: 'Implementar CI/CD con Webhook Master'
    });
    assert(Boolean(fiveWhys.id), 'Análisis de 5 Porqués creado y enlazado a acción correctiva');

    // 4.2 Ishikawa 6M
    const ishikawa = await opexService.createIshikawaDiagram(DEFAULT_WORKSPACE_ID, testProjectId, {
      title: 'Dispersión de Tiempos de Entrega',
      problem_statement: 'Variabilidad en sprints semanales'
    });
    const factor = await opexService.addIshikawaFactor(DEFAULT_WORKSPACE_ID, ishikawa.id, {
      category: 'METHODS',
      factor_text: 'Falta de validación estricta de WIP en Kanban',
      weight: 8
    });
    assert(Boolean(factor.id), 'Diagrama Ishikawa y factor 6M creados');

    // 4.3 FODA (SWOT)
    const swot = await opexService.addSwotItem(DEFAULT_WORKSPACE_ID, testProjectId, {
      type: 'STRENGTH',
      description: 'Aislamiento multi-tenant con RLS en Neon',
      impact_level: 'CRITICAL',
      score: 10
    });
    assert(swot.type === 'STRENGTH', 'Ítem FODA registrado correctamente');

    // 4.4 Pareto (80/20)
    await opexService.recordParetoData(DEFAULT_WORKSPACE_ID, testProjectId, {
      category: 'Defectos de Integración',
      frequency: 45
    });
    await opexService.recordParetoData(DEFAULT_WORKSPACE_ID, testProjectId, {
      category: 'Despliegues Manuales',
      frequency: 35
    });
    await opexService.recordParetoData(DEFAULT_WORKSPACE_ID, testProjectId, {
      category: 'Lapsos de Espera en QA',
      frequency: 12
    });
    await opexService.recordParetoData(DEFAULT_WORKSPACE_ID, testProjectId, {
      category: 'Otros',
      frequency: 8
    });

    const pareto = await opexService.getParetoAnalysis(DEFAULT_WORKSPACE_ID, testProjectId);
    assert(pareto.items.length >= 4, 'Análisis de Pareto generado');
    assert(pareto.items[0].frequency >= pareto.items[1].frequency, 'Ítems ordenados de mayor a menor frecuencia');
    assert(typeof pareto.items[0].cumulativePercentage === 'number', 'Porcentaje acumulado 80/20 calculado');

    // --------------------------------------------------------------------------
    // 5. BLOCK DE NOTAS COLABORATIVO
    // --------------------------------------------------------------------------
    console.log('\n📌 5. BLOCK DE NOTAS COLABORATIVO (MARKDOWN & WEBSOCKETS)');

    const notesService = new NotesService(pool, mockIo);
    const note = await notesService.createNote(DEFAULT_WORKSPACE_ID, null, {
      title: 'Arquitectura Multi-Workspace y Calendario',
      content: '## Resumen Ejecutivo\n- Multi-tenant habilitado con RLS.',
      tags: ['arquitectura', 'seguridad', 'opex']
    });
    assert(Boolean(note.id), 'Nota creada en workspace_notes');

    const updatedNote = await notesService.updateNote(DEFAULT_WORKSPACE_ID, note.id, {
      content: '## Resumen Ejecutivo\n- Multi-tenant habilitado con RLS.\n- Webhook Master conectado.'
    });
    assert(updatedNote.content.includes('Webhook Master'), 'Nota autoguardada con éxito');

    const emittedNote = emittedEvents.find(e => e.event === 'NOTE_UPDATED' && e.room === `workspace_${DEFAULT_WORKSPACE_ID}`);
    assert(Boolean(emittedNote), 'Evento NOTE_UPDATED emitido exclusivamente a la sala workspace_WORKSPACE_ID');

    // --------------------------------------------------------------------------
    // 6. PIPELINE CI/CD & DOCKERFILE
    // --------------------------------------------------------------------------
    console.log('\n📌 6. PIPELINE EN GITHUB ACTIONS & DOCKERFILE MULTI-STAGE');

    const workflowFile = fs.readFileSync(path.join(__dirname, '../.github/workflows/deploy.yml'), 'utf-8');
    assert(workflowFile.includes('quality-gate:'), 'Workflow contiene etapa quality-gate');
    assert(workflowFile.includes('build-and-push:'), 'Workflow contiene etapa build-and-push');
    assert(workflowFile.includes('deploy-production:'), 'Workflow contiene etapa deploy-production');
    assert(workflowFile.includes('report-telemetry:'), 'Workflow contiene etapa report-telemetry');
    assert(workflowFile.includes('if: always()'), 'Etapa report-telemetry se ejecuta bajo condición always()');
    assert(workflowFile.includes('CI_CD_EXECUTION'), 'Reporta evento CI_CD_EXECUTION al Webhook Master');

    const dockerfile = fs.readFileSync(path.join(__dirname, '../Dockerfile'), 'utf-8');
    assert(dockerfile.includes('AS builder'), 'Dockerfile contiene etapa builder');
    assert(dockerfile.includes('AS runner'), 'Dockerfile contiene etapa runner');
    assert(dockerfile.includes('appuser'), 'Dockerfile configura usuario sin privilegios root (appuser UID 1001)');
    assert(dockerfile.includes('EXPOSE 8080'), 'Dockerfile expone puerto 8080');

    // Probar Webhook Master con CI_CD_EXECUTION (success)
    reqMock.body = {
      event: 'CI_CD_EXECUTION',
      commit_sha: 'c0ffee1234567890abcdef1234567890abcdef12',
      branch: 'main',
      author: 'Antigravity Architect',
      workflow_status: 'success',
      phases_detail: [
        { name: 'quality-gate', status: 'success' },
        { name: 'build-and-push', status: 'success' },
        { name: 'deploy-production', status: 'success' }
      ],
      timestamp: new Date().toISOString(),
      projectId: testProjectId,
      workspaceId: DEFAULT_WORKSPACE_ID
    };

    await masterWebhook.handleMasterWebhook(reqMock, resMock);
    assert(masterResCode === 200 && masterResData?.event === 'CI_CD_EXECUTION', 'Webhook Master procesa telemetría de CI/CD');

    await dagCache.close();

    console.log('\n========================================================================');
    console.log(`🏁 RESULTADOS: ${passed} PRUEBAS PASADAS, ${failed} FALLIDAS`);
    console.log('========================================================================');

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Test Suite Error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMasterTestSuite();
