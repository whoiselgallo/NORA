import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../.env.local') });

import { Pool } from 'pg';
import { NexusOnboardingService } from './services/nexusOnboarding.service';
import { MasterWebhookHandler } from './webhooks/master.handler';
import { DagCacheService } from './services/dagCache.service';
import { NexusOnboardingSessionInput } from './validation/schemas';
import { ProjectArchetype } from './services/blueprintEngine.service';

process.on('uncaughtException', (err: any) => {
  if (err?.message?.includes('Connection terminated unexpectedly')) {
    return;
  }
  console.error('Unhandled Exception in Test:', err);
  process.exit(1);
});

async function runNexusOnboardingTestSuite() {
  console.log('=============================================================================');
  console.log('🚀 SUITE DE VERIFICACIÓN INTEGRAL: NEXUS ARCHITECT ONBOARDING ENGINE & DAG');
  console.log('   Arquetipos • Matriz 5 Vectores • Contratos Oficiales • Routing CI/CD');
  console.log('=============================================================================\n');

  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is missing in environment.');
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  pool.on('error', () => {
    // Ignore pool background disconnects
  });

  const emittedWsEvents: Array<{ room: string; event: string; payload: any }> = [];
  const mockIo = {
    to: (room: string) => ({
      emit: (event: string, payload: any) => {
        emittedWsEvents.push({ room, event, payload });
      }
    }),
    emit: (event: string, payload: any) => {
      emittedWsEvents.push({ room: 'global', event, payload });
    }
  } as any;

  const dagCache = new DagCacheService();
  const masterWebhookHandler = new MasterWebhookHandler(pool, mockIo, dagCache);
  const onboardingService = new NexusOnboardingService(pool, mockIo);

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

  const createdWorkspaceIds: string[] = [];
  const createdUserEmails: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // 1. VERIFICACIÓN DEL CATÁLOGO OFICIAL DE SERVICIOS
    // -------------------------------------------------------------------------
    console.log('📌 1. VALIDACIÓN DEL CATÁLOGO OFICIAL DE SERVICIOS (13 PAQUETES / 3 DOMINIOS)...');
    const catalog = await onboardingService.getServiceCatalog();
    assert(Array.isArray(catalog) && catalog.length >= 13, `Catálogo oficial contiene ${catalog.length} paquetes (esperado >= 13)`);

    const domains = new Set(catalog.map(c => c.domain));
    assert(domains.has('vc.tsolutionsipidd.com'), 'Dominio Rose vCard (vc.tsolutionsipidd.com) presente');
    assert(domains.has('identidad.tsolutionsipidd.com'), 'Dominio Identidad de Marca (identidad.tsolutionsipidd.com) presente');
    assert(domains.has('www.tsolutionsipidd.com'), 'Dominio Software & OPEX (www.tsolutionsipidd.com) presente');

    const expectedArchetypes: ProjectArchetype[] = [
      'BIOLINK', 'LANDING_PAGE', 'DIGITAL_MENU', 'BRAND_IDENTITY',
      'CORPORATE_WEB', 'WEB_WITH_API', 'ECOMMERCE', 'SAAS_WEBAPP', 'OPEX_MANAGEMENT'
    ];
    const catalogArchetypes = new Set(catalog.map(c => c.archetype));
    const allArchetypesPresent = expectedArchetypes.every(a => catalogArchetypes.has(a));
    assert(allArchetypesPresent, 'Los 9 arquetipos de proyecto están mapeados en el catálogo');

    const pkgEcommerce = await onboardingService.getPackageByCode('ECOMMERCE_FULL');
    assert(pkgEcommerce !== null && pkgEcommerce.package_code === 'ECOMMERCE_FULL', 'Búsqueda por código de paquete ECOMMERCE_FULL exitosa');
    assert(Number(pkgEcommerce.price_amount) === 32000, 'Tarifa oficial de ECOMMERCE_FULL coincide con $32,000 MXN');

    // -------------------------------------------------------------------------
    // 2. APROVISIONAMIENTO ATÓMICO: ARQUETIPO ECOMMERCE
    // -------------------------------------------------------------------------
    console.log('\n📌 2. SESIÓN DE ONBOARDING ATÓMICA: ARQUETIPO ECOMMERCE...');
    const ecomInput: NexusOnboardingSessionInput = {
      archetype: 'ECOMMERCE',
      project_name: 'Nexus Shop Flagship Test',
      project_description: 'Plataforma de comercio omnicanal con catálogo reactivo y checkout Stripe.',
      client_name: 'Don Gallo Retail Owner',
      client_email: `ecom-owner-${Date.now()}@tsolutionsipidd.test`,
      company_name: 'Gallo Retail Corp',
      target_domain: 'https://tienda.galloretail.com',
      raci: {
        tech_lead_name: 'Ing. Rodrigo Tech Lead',
        tech_lead_email: `tl-ecom-${Date.now()}@tsolutionsipidd.test`,
        project_manager_name: 'Lic. Sofia Project Manager',
        project_manager_email: `pm-ecom-${Date.now()}@tsolutionsipidd.test`,
        collaborators: [
          { name: 'Dev Colaborador 1', email: `dev1-${Date.now()}@tsolutionsipidd.test` }
        ]
      },
      technical: {
        repository_provider: 'GITHUB',
        github_repo: 'whoiselgallo/gallo-store-repo',
        payment_gateway: 'STRIPE',
        enable_google_tasks: false
      },
      commercial: {
        package_code: 'ECOMMERCE_FULL',
        payment_terms: '50/50',
        custom_price: 32000,
        target_delivery_date: '2026-10-31'
      }
    };

    createdUserEmails.push(ecomInput.client_email);
    createdUserEmails.push(ecomInput.raci!.tech_lead_email!);
    createdUserEmails.push(ecomInput.raci!.project_manager_email!);
    createdUserEmails.push(ecomInput.raci!.collaborators![0].email);

    const resultEcom = await onboardingService.processOnboardingSession(ecomInput);
    createdWorkspaceIds.push(resultEcom.workspace.id);

    assert(Boolean(resultEcom.workspace?.id), 'Workspace aprovisionado con ID UUID');
    assert(resultEcom.workspace.slug.startsWith('gallo-retail-corp-'), `Slug de Workspace único generado: ${resultEcom.workspace.slug}`);
    assert(resultEcom.clientUser.role === 'CLIENT', 'Usuario cliente creado con rol CLIENT');
    assert(resultEcom.project.archetype === 'ECOMMERCE', 'Proyecto registrado con arquetipo ECOMMERCE');
    assert(resultEcom.contract.deliverable_type === 'CONTRACT_MASTER', 'Contrato compilado con tipo CONTRACT_MASTER');
    assert(resultEcom.contract.total_amount === 32000, 'Monto contractual registrado correctamente ($32,000 MXN)');
    assert(Boolean(resultEcom.webhookConfig.routing_key), `Webhook CI/CD configurado con Routing Key: ${resultEcom.webhookConfig.routing_key.substring(0, 10)}...`);
    assert(resultEcom.dag.nodeCount >= 5, `Topología DAG sembrada con ${resultEcom.dag.nodeCount} nodos (esperado >= 5)`);
    assert(resultEcom.dag.edgeCount >= 4, `Grafo DAG enlazado con ${resultEcom.dag.edgeCount} dependencias (workflow_edges)`);

    // -------------------------------------------------------------------------
    // 3. VERIFICACIÓN DE INTEGRIDAD EN BASE DE DATOS PARA ECOMMERCE
    // -------------------------------------------------------------------------
    console.log('\n📌 3. AUDITORÍA DE INTEGRIDAD EN NEON POSTGRESQL...');
    const client = await pool.connect();
    try {
      // Verificar RLS y roles en workspace_members
      const membersRes = await client.query(
        `SELECT wm.role, u.email FROM workspace_members wm
         JOIN users u ON u.id = wm.user_id
         WHERE wm.workspace_id = $1`,
        [resultEcom.workspace.id]
      );
      const rolesMap = new Map(membersRes.rows.map(r => [r.email, r.role]));
      assert(rolesMap.get(ecomInput.client_email) === 'CLIENT', 'Cliente tiene rol CLIENT en workspace_members');
      assert(rolesMap.get(ecomInput.raci!.tech_lead_email!) === 'ADMIN', 'Tech Lead tiene rol ADMIN en workspace_members');
      assert(rolesMap.get(ecomInput.raci!.collaborators![0].email) === 'COLLABORATOR', 'Colaborador tiene rol COLLABORATOR');

      // Verificar nodos del DAG en RED y tareas en TODO
      const nodesRes = await client.query(
        `SELECT status, category, is_automated_github FROM workflow_nodes WHERE workflow_id = $1`,
        [resultEcom.dag.workflowId]
      );
      const allNodesRed = nodesRes.rows.every(n => n.status === 'RED');
      assert(allNodesRed, `Todos los ${nodesRes.rows.length} nodos del DAG están sembrados en estado RED`);

      const tasksRes = await client.query(
        `SELECT pt.status, pt.title FROM project_tasks pt
         JOIN workflow_node_tasks wnt ON wnt.task_id = pt.id
         JOIN workflow_nodes wn ON wn.id = wnt.node_id
         WHERE wn.workflow_id = $1`,
        [resultEcom.dag.workflowId]
      );
      assert(tasksRes.rows.length > 0, `Tareas To-Do generadas y vinculadas a nodos del DAG (${tasksRes.rows.length} tareas)`);
      const allTasksTodo = tasksRes.rows.every(t => t.status === 'TODO');
      assert(allTasksTodo, 'Todas las tareas asociadas al DAG se encuentran en estado inicial TODO');

      // Verificar tokens oficiales en el contrato legal compilado
      const contractDbRes = await client.query(
        `SELECT * FROM corporate_deliverables WHERE id = $1`,
        [resultEcom.contract.id]
      );
      const contractRow = contractDbRes.rows[0];
      assert(contractRow !== undefined, 'Contrato almacenado en corporate_deliverables');
      assert(contractRow.status === 'ACTIVE' || contractRow.status === 'FINAL', 'Estado del contrato es válido (ACTIVE/FINAL)');

      const contractHtml: string = contractRow.content_html || '';
      assert(contractHtml.includes('#FF6B00'), 'Contrato incluye Token Naranja Energy (#FF6B00)');
      assert(contractHtml.includes('#00E5FF'), 'Contrato incluye Token Aqua Turquesa (#00E5FF)');
      assert(contractHtml.includes('#0A0D14'), 'Contrato incluye Token Midnight Background (#0A0D14)');
      assert(contractHtml.includes('Bruno Ace'), 'Contrato estilizado con tipografía Bruno Ace');
      assert(contractHtml.includes('Space Grotesk'), 'Contrato estilizado con tipografía Space Grotesk');
      assert(contractHtml.includes('Tecnología instalada. Conocimiento transferido. Negocios escalados.'), 'Contrato incluye el lema oficial de TSolutions IPIDD');
      assert(contractHtml.includes('Gallo Retail Corp') || contractHtml.includes('Don Gallo Retail Owner'), 'Contrato contiene el nombre del cliente / empresa');

      // Verificar hito en calendar_events
      const calendarRes = await client.query(
        `SELECT * FROM calendar_events WHERE project_id = $1 AND event_type = 'DELIVERY_DEADLINE'`,
        [resultEcom.project.id]
      );
      assert(calendarRes.rows.length > 0, 'Hito DELIVERY_DEADLINE registrado en calendar_events');
      assert(calendarRes.rows[0].priority === 'HIGH', 'Prioridad del hito de entrega es HIGH');
      assert(calendarRes.rows[0].due_date.toISOString().startsWith('2026-10-31'), 'Fecha límite coincide con 2026-10-31');
    } finally {
      client.release();
    }

    // -------------------------------------------------------------------------
    // 4. VERIFICACIÓN DE WEBHOOK CI/CD & TRANSICIÓN REACTIVA DEL DAG
    // -------------------------------------------------------------------------
    console.log('\n📌 4. SIMULACIÓN DE TELEMETRÍA CI/CD VÍA WEBHOOK MASTER (ROUTING KEY)...');
    let webhookResCode = 200;
    let webhookResBody: any = null;
    const reqMock: any = {
      params: { routingKey: resultEcom.webhookConfig.routing_key },
      body: {
        event: 'CI_CD_EXECUTION',
        commit_sha: 'a1b2c3d4e5f67890123456789abcdef012345678',
        branch: 'main',
        author: 'Nexus CI/CD Runner',
        workflow_status: 'success',
        phases_detail: [
          { name: 'lint-and-typecheck', status: 'success' },
          { name: 'automated-tests', status: 'success' },
          { name: 'docker-build', status: 'success' },
          { name: 'cloud-run-deploy', status: 'success' }
        ],
        timestamp: new Date().toISOString()
      }
    };
    const resMock: any = {
      status: (code: number) => {
        webhookResCode = code;
        return resMock;
      },
      json: (data: any) => {
        webhookResBody = data;
        return resMock;
      }
    };

    await masterWebhookHandler.handleMasterWebhook(reqMock, resMock);
    assert(webhookResCode === 200, `Webhook Master respondió HTTP 200 (recibido ${webhookResCode})`);
    assert(webhookResBody?.status === 'PROCESSED', 'Webhook Master procesó exitosamente la telemetría CI/CD');

    // Verificar que los nodos técnicos pasaron de RED a GREEN en base de datos
    const checkNodesClient = await pool.connect();
    try {
      const greenNodesRes = await checkNodesClient.query(
        `SELECT id, slug, status, category FROM workflow_nodes 
         WHERE workflow_id = $1 AND status = 'GREEN'`,
        [resultEcom.dag.workflowId]
      );
      assert(greenNodesRes.rows.length > 0, `Nodos técnicos automatizados pasaron a GREEN (${greenNodesRes.rows.length} nodos)`);
    } finally {
      checkNodesClient.release();
    }

    // -------------------------------------------------------------------------
    // 5. APROVISIONAMIENTO ATÓMICO: ARQUETIPO BIOLINK (ROSE VCARD)
    // -------------------------------------------------------------------------
    console.log('\n📌 5. SESIÓN DE ONBOARDING: ARQUETIPO BIOLINK (ROSE VCARD ENGINE)...');
    const biolinkInput: NexusOnboardingSessionInput = {
      archetype: 'BIOLINK',
      project_name: 'Dra. Elena VCard Pro',
      project_description: 'Biolink corporativo con código QR dinámico y botones de contacto directo.',
      client_name: 'Dra. Elena Morales',
      client_email: `elena-vcard-${Date.now()}@tsolutionsipidd.test`,
      target_domain: 'https://vc.tsolutionsipidd.com/elena-morales',
      raci: {
        collaborators: []
      },
      technical: {
        repository_provider: 'BLUEPRINT_GENERATED',
        payment_gateway: 'NONE',
        enable_google_tasks: false
      },
      commercial: {
        package_code: 'VCARD_BUSINESS_PRO',
        payment_terms: 'ANNUAL',
        custom_price: 2500
      }
    };
    createdUserEmails.push(biolinkInput.client_email);

    const resultBiolink = await onboardingService.processOnboardingSession(biolinkInput);
    createdWorkspaceIds.push(resultBiolink.workspace.id);

    assert(resultBiolink.contract.deliverable_type === 'CONTRACT_VCARD_LICENSE', 'Contrato compilado como CONTRACT_VCARD_LICENSE para Biolink');
    assert(resultBiolink.contract.total_amount === 2500, 'Monto registrado para Biolink es $2,500 MXN');
    assert(resultBiolink.dag.nodeCount >= 4, `Topología Rose vCard sembrada con ${resultBiolink.dag.nodeCount} nodos (esperado >= 4)`);

    // -------------------------------------------------------------------------
    // 6. APROVISIONAMIENTO ATÓMICO: ARQUETIPO BRAND IDENTITY
    // -------------------------------------------------------------------------
    console.log('\n📌 6. SESIÓN DE ONBOARDING: ARQUETIPO BRAND IDENTITY (IDENTIDAD DE MARCA)...');
    const brandInput: NexusOnboardingSessionInput = {
      archetype: 'BRAND_IDENTITY',
      project_name: 'Renovación Marca Lumina',
      project_description: 'Diseño integral de identidad corporativa, tokens de diseño y manual de normas.',
      client_name: 'Lic. Mateo Valenzuela',
      client_email: `mateo-brand-${Date.now()}@tsolutionsipidd.test`,
      company_name: 'Lumina Tech Solutions',
      raci: {
        collaborators: []
      },
      technical: {
        repository_provider: 'BLUEPRINT_GENERATED',
        payment_gateway: 'NONE',
        enable_google_tasks: false
      },
      commercial: {
        package_code: 'BRAND_INTEGRAL',
        payment_terms: '50/50',
        custom_price: 24000
      }
    };
    createdUserEmails.push(brandInput.client_email);

    const resultBrand = await onboardingService.processOnboardingSession(brandInput);
    createdWorkspaceIds.push(resultBrand.workspace.id);

    assert(resultBrand.contract.deliverable_type === 'CONTRACT_BRAND_ASSIGNMENT', 'Contrato compilado como CONTRACT_BRAND_ASSIGNMENT para Marca');
    assert(resultBrand.dag.nodeCount >= 5, `Topología de Marca sembrada con ${resultBrand.dag.nodeCount} nodos`);

    // -------------------------------------------------------------------------
    // 7. VERIFICACIÓN DE AISLAMIENTO MULTI-TENANT
    // -------------------------------------------------------------------------
    console.log('\n📌 7. VERIFICACIÓN DE AISLAMIENTO MULTI-TENANT...');
    const foreignContract = await onboardingService.getProjectContract(
      resultBiolink.workspace.id,
      resultEcom.project.id
    );
    assert(foreignContract === null, 'Aislamiento RLS: Consulta entre workspaces cruzados deniega acceso al contrato');

    const ownContract = await onboardingService.getProjectContract(
      resultEcom.workspace.id,
      resultEcom.project.id
    );
    assert(ownContract !== null && ownContract.id === resultEcom.contract.id, 'Consulta en workspace propio retorna el contrato legítimo');

    // -------------------------------------------------------------------------
    // 8. LIMPIEZA DE DATOS DE PRUEBA
    // -------------------------------------------------------------------------
    console.log('\n📌 8. LIMPIEZA DE DATOS GENERADOS EN LA SUITE...');
    const cleanupClient = await pool.connect();
    try {
      await cleanupClient.query('BEGIN');
      for (const wsId of createdWorkspaceIds) {
        // Borrar dependencias del workspace
        await cleanupClient.query(`DELETE FROM github_telemetry_events WHERE workspace_id = $1`, [wsId]);
        await cleanupClient.query(`DELETE FROM calendar_events WHERE workspace_id = $1`, [wsId]);
        await cleanupClient.query(`DELETE FROM corporate_deliverables WHERE workspace_id = $1`, [wsId]);
        await cleanupClient.query(`DELETE FROM project_webhook_configs WHERE workspace_id = $1`, [wsId]);

        // Borrar edges y tasks
        await cleanupClient.query(`
          DELETE FROM workflow_node_tasks WHERE node_id IN (
            SELECT id FROM workflow_nodes WHERE workflow_id IN (
              SELECT id FROM project_workflows WHERE project_id IN (
                SELECT id FROM projects WHERE workspace_id = $1
              )
            )
          )
        `, [wsId]);
        await cleanupClient.query(`
          DELETE FROM workflow_edges WHERE workflow_id IN (
            SELECT id FROM project_workflows WHERE project_id IN (
              SELECT id FROM projects WHERE workspace_id = $1
            )
          )
        `, [wsId]);
        await cleanupClient.query(`
          DELETE FROM workflow_nodes WHERE workflow_id IN (
            SELECT id FROM project_workflows WHERE project_id IN (
              SELECT id FROM projects WHERE workspace_id = $1
            )
          )
        `, [wsId]);
        await cleanupClient.query(`
          DELETE FROM project_workflows WHERE project_id IN (
            SELECT id FROM projects WHERE workspace_id = $1
          )
        `, [wsId]);
        await cleanupClient.query(`DELETE FROM project_tasks WHERE workspace_id = $1`, [wsId]);
        await cleanupClient.query(`DELETE FROM projects WHERE workspace_id = $1`, [wsId]);
        await cleanupClient.query(`DELETE FROM workspace_members WHERE workspace_id = $1`, [wsId]);
        await cleanupClient.query(`DELETE FROM workspaces WHERE id = $1`, [wsId]);
      }

      for (const email of createdUserEmails) {
        await cleanupClient.query(`DELETE FROM users WHERE email = $1`, [email]);
      }
      await cleanupClient.query('COMMIT');
      console.log('  ✓ Limpieza completada con éxito.');
    } catch (cleanupErr) {
      await cleanupClient.query('ROLLBACK');
      console.warn('  ⚠️ Advertencia en limpieza:', cleanupErr);
    } finally {
      cleanupClient.release();
    }

  } catch (err: any) {
    console.error('\n❌ ERROR CRÍTICO EN TEST SUITE:', err);
    failed++;
  } finally {
    await dagCache.close();
    await pool.end();
  }

  console.log('\n=============================================================================');
  console.log(`🏁 RESULTADOS: ${passed} PRUEBAS EXITOSAS, ${failed} FALLIDAS`);
  console.log('=============================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runNexusOnboardingTestSuite();
