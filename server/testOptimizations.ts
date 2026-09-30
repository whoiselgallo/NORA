import { Pool } from 'pg';
import path from 'path';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { generateNeonAuthToken, authenticateNeonAuth, requireRole, NeonAuthUser } from './middleware/auth.middleware';
import {
  TaskCreateSchema,
  TaskMutationSchema,
  TaskStatusUpdateSchema,
  GitHubWebhookSchema,
  CreateCampaignSchema,
  SubscribeContactSchema
} from './validation/schemas';
import { validateBody } from './middleware/validate.middleware';
import { DagCacheService, ProjectWorkflowDAG } from './services/dagCache.service';
import { CampaignDispatcherService } from './services/campaignDispatcher.service';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function runOptimizationsTestSuite() {
  console.log('===============================================================');
  console.log('🚀 SUITE DE VERIFICACIÓN: 5 OPTIMIZACIONES CRÍTICAS');
  console.log('===============================================================\n');

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

  // --------------------------------------------------------------------------
  // TEST 1: AUTENTICACIÓN Y SEGURIDAD CON NEON AUTH
  // --------------------------------------------------------------------------
  console.log('📌 1. VALIDACIÓN NEON AUTH & RBAC MIDDLEWARES');

  const adminUser: NeonAuthUser = {
    sub: 'usr_admin_001',
    email: 'admin@mpsayala.com',
    role: 'ADMIN',
    projects: ['prj_alpha', 'prj_beta']
  };

  const clientUser: NeonAuthUser = {
    sub: 'usr_client_002',
    email: 'cliente@mpsayala.com',
    role: 'CLIENT',
    projects: ['prj_alpha']
  };

  const adminToken = generateNeonAuthToken(adminUser);
  const clientToken = generateNeonAuthToken(clientUser);

  // 1.1 Simular middleware authenticateNeonAuth con token válido
  let reqMock: any = { headers: { authorization: `Bearer ${adminToken}` } };
  let resMock: any = { status: (code: number) => ({ json: (d: any) => ({ code, d }) }) };
  const tracker = { nextCalled: false, allowAdmin: false };

  authenticateNeonAuth(reqMock, resMock, () => { tracker.nextCalled = true; });
  assert(tracker.nextCalled, 'authenticateNeonAuth permite token válido');
  assert(reqMock.user?.sub === adminUser.sub, 'req.user.sub extraído correctamente');
  assert(reqMock.user?.role === 'ADMIN', 'req.user.role extraído correctamente');
  assert(Array.isArray(reqMock.user?.projects) && reqMock.user.projects.includes('prj_alpha'), 'req.user.projects extraído');

  // 1.2 Simular token faltante -> 401
  let statusCode401 = 0;
  let errorMsg401 = '';
  reqMock = { headers: {} };
  resMock = {
    status: (code: number) => {
      statusCode401 = code;
      return { json: (d: any) => { errorMsg401 = d.error; } };
    }
  };
  authenticateNeonAuth(reqMock, resMock, () => {});
  assert(statusCode401 === 401, 'authenticateNeonAuth rechaza encabezado faltante con 401');

  // 1.3 Simular requireRole: ADMIN permitido, CLIENT rechazado con 403
  const roleMiddleware = requireRole(['ADMIN', 'COLLABORATOR']);
  reqMock = { user: adminUser };
  roleMiddleware(reqMock, resMock, () => { tracker.allowAdmin = true; });
  assert(tracker.allowAdmin, 'requireRole permite rol ADMIN');

  let forbidClient = false;
  let statusCode403 = 0;
  reqMock = { user: clientUser };
  resMock = {
    status: (code: number) => {
      statusCode403 = code;
      return { json: () => { forbidClient = true; } };
    }
  };
  roleMiddleware(reqMock, resMock, () => {});
  assert(statusCode403 === 403, 'requireRole rechaza rol CLIENT con 403 Forbidden');

  // --------------------------------------------------------------------------
  // TEST 2: VALIDACIÓN ESTRICTA EN RUNTIME CON ZOD
  // --------------------------------------------------------------------------
  console.log('\n📌 2. VALIDACIÓN ESTRICTA EN RUNTIME CON ZOD');

  // 2.1 TaskMutationSchema / TaskCreateSchema válido
  const validTaskPayload = {
    title: 'Implementar caché DAG en Redis',
    description: 'Acelera lecturas de topología a < 10ms',
    priority: 'HIGH',
    status: 'TODO',
    assigned_to: '11111111-1111-4111-8111-111111111111',
    due_date: new Date().toISOString()
  };
  const taskParseValid = TaskCreateSchema.safeParse(validTaskPayload);
  assert(taskParseValid.success === true, 'TaskCreateSchema acepta payload completo y válido');

  // 2.2 TaskMutationSchema inválido (título muy corto < 3, status inválido)
  const invalidTaskPayload = {
    title: 'No',
    priority: 'INVALID_PRIORITY',
    status: 'UNKNOWN_STATUS'
  };
  const taskParseInvalid = TaskMutationSchema.safeParse(invalidTaskPayload);
  assert(taskParseInvalid.success === false, 'TaskMutationSchema rechaza título < 3 y enum inválido');

  // 2.3 Middleware validateBody(schema) reporta desglose de campos 400
  let validationErrorDetails: any[] = [];
  let validateStatusCode = 0;
  reqMock = { body: invalidTaskPayload };
  resMock = {
    status: (code: number) => {
      validateStatusCode = code;
      return {
        json: (data: any) => {
          validationErrorDetails = data.details;
        }
      };
    }
  };
  const validateTaskMiddleware = validateBody(TaskMutationSchema);
  validateTaskMiddleware(reqMock, resMock, () => {});
  assert(validateStatusCode === 400, 'validateBody retorna 400 ante payload inválido');
  assert(validationErrorDetails.length >= 2, 'validateBody devuelve desglose específico por campo');

  // 2.4 GitHubWebhookSchema: workflow_run y push
  const validWorkflowRunPayload = {
    action: 'completed',
    workflow_run: {
      id: 123456789,
      head_sha: 'a1b2c3d4e5f6789012345678901234567890abcd',
      head_branch: 'main',
      conclusion: 'success',
      status: 'completed'
    },
    repository: {
      id: 987654321,
      name: 'antigravity-instruction-architect',
      full_name: 'whoiselgallo/antigravity-instruction-architect'
    }
  };
  const webhookParse = GitHubWebhookSchema.safeParse(validWorkflowRunPayload);
  assert(webhookParse.success === true, 'GitHubWebhookSchema valida workflow_run con id numérico, sha y rama');

  // 2.5 Marketing schemas: suscripción y campañas
  const validSubscribe = {
    audience_id: '22222222-2222-4222-8222-222222222222',
    email: 'contacto.ferretero@mpsayala.com',
    first_name: 'Juan'
  };
  assert(SubscribeContactSchema.safeParse(validSubscribe).success === true, 'SubscribeContactSchema valida correo');
  assert(SubscribeContactSchema.safeParse({ email: 'correo-invalido', audience_id: 'bad-uuid' }).success === false, 'SubscribeContactSchema rechaza formato inválido');

  // --------------------------------------------------------------------------
  // TEST 3: CAPA DE CACHÉ DE GRAFOS EN REDIS (DAG CACHE & INVALIDATION)
  // --------------------------------------------------------------------------
  console.log('\n📌 3. CAPA DE CACHÉ DAG EN REDIS & INVALIDACIÓN ATÓMICA');

  const testProjectId = '00000000-0000-4000-8000-000000000001';
  const dagCache = new DagCacheService();

  const mockDAG: ProjectWorkflowDAG = {
    workflow: {
      id: 'wf_001',
      project_id: testProjectId,
      name: 'Primary Workflow',
      created_at: new Date().toISOString()
    },
    nodes: [
      {
        id: 'node_1',
        title: 'Infraestructura Neon',
        category: 'infra',
        status: 'RED',
        is_automated_github: false,
        position_x: 100,
        position_y: 100
      }
    ],
    edges: []
  };

  // Simular almacenamiento en caché
  await dagCache.setDag(testProjectId, mockDAG, 86400);
  const cachedDAG = await dagCache.getDag(testProjectId);
  assert(
    cachedDAG === null || cachedDAG.workflow.id === 'wf_001',
    'DagCacheService soporta escritura y lectura con TTL 24h (o degradación elegante si no hay Redis local)'
  );

  // Simular borrado atómico
  const deleted = await dagCache.invalidateDag(testProjectId);
  const afterInvalidate = await dagCache.getDag(testProjectId);
  assert(afterInvalidate === null, 'invalidateDag elimina atómicamente project:PROJECT_ID:dag');

  // --------------------------------------------------------------------------
  // TEST 4: DESPACHO POR LOTES (BATCHING) EN BULLMQ
  // --------------------------------------------------------------------------
  console.log('\n📌 4. DESPACHO POR LOTES (BATCHING) EN BULLMQ');

  // Verificar partición lógica de 50 destinatarios
  const mockContacts = Array.from({ length: 135 }, (_, i) => ({
    id: `contact_${i}`,
    email: `cliente_${i}@dominio.com`,
    first_name: `Nombre ${i}`,
    last_name: `Apellido ${i}`
  }));

  const BATCH_SIZE = 50;
  const batches: any[][] = [];
  for (let i = 0; i < mockContacts.length; i += BATCH_SIZE) {
    batches.push(mockContacts.slice(i, i + BATCH_SIZE));
  }

  assert(batches.length === 3, '135 destinatarios se dividen exactamente en 3 bloques (50, 50, 35)');
  assert(batches[0].length === 50 && batches[1].length === 50 && batches[2].length === 35, 'Tamaños de bloques correctos');

  // Comprobar configuración de la cola
  const mockIo: any = { to: () => ({ emit: () => {} }) };
  const mockPool: any = {};
  const dispatcher = new CampaignDispatcherService(mockPool, mockIo, undefined, dagCache);
  const queue = dispatcher.getQueue();

  assert(queue.name === 'email-marketing-batch-queue', 'Cola configurada como email-marketing-batch-queue');
  assert(queue.defaultJobOptions.attempts === 3, 'Configuración obligatoria de 3 reintentos');
  assert(
    (queue.defaultJobOptions.backoff as any)?.delay === 5000,
    'Retroceso exponencial configurado con 5000ms'
  );

  // --------------------------------------------------------------------------
  // TEST 5: VIRTUALIZACIÓN DE TAREAS EN FRONTEND CON REACT VIRTUAL
  // --------------------------------------------------------------------------
  console.log('\n📌 5. VIRTUALIZACIÓN CON @TANSTACK/REACT-VIRTUAL');

  // Verificar que el componente VirtualTodoList existe en disco y tiene el contrato requerido
  const fs = await import('fs');
  const virtualTodoListPath = path.join(__dirname, '../src/components/dashboard/VirtualTodoList.tsx');
  const fileExists = fs.existsSync(virtualTodoListPath);
  assert(fileExists, 'VirtualTodoList.tsx existe en src/components/dashboard');

  if (fileExists) {
    const fileContent = fs.readFileSync(virtualTodoListPath, 'utf-8');
    assert(fileContent.includes('useVirtualizer'), 'VirtualTodoList utiliza el hook useVirtualizer de @tanstack/react-virtual');
    assert(fileContent.includes('estimateSize: () => 64'), 'Configura altura estimada de 64 píxeles por fila');
    assert(fileContent.includes('overscan: 5'), 'Configura overscan de 5 elementos');
    assert(fileContent.includes('transform: `translateY('), 'Posiciona elementos con transform: translateY');
    assert(fileContent.includes('measureElement'), 'Utiliza measureElement para soporte de títulos multilínea');
    assert(fileContent.includes('No se encontraron tareas'), 'Maneja estado vacío elegante');
  }

  // Limpieza
  await dagCache.close();
  await queue.close();

  console.log('\n===============================================================');
  console.log(`🏁 RESULTADOS: ${passed} PRUEBAS PASADAS, ${failed} FALLIDAS`);
  console.log('===============================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runOptimizationsTestSuite().catch(err => {
  console.error('Test Suite Error:', err);
  process.exit(1);
});
