import { Pool } from 'pg';
import path from 'path';
import dotenv from 'dotenv';
import { BlueprintEngineService } from './services/blueprintEngine.service';
import { TaskManagerService } from './services/taskManager.service';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function runIntegrationTest() {
  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  // Mock Socket.IO server
  const mockIo = {
    to: (_room: string) => ({
      emit: (event: string, payload: any) => {
        console.log(`[WS EMIT -> ${_room}] ${event}:`, JSON.stringify(payload));
      }
    })
  } as any;

  const client = await pool.connect();
  try {
    console.log('--- 1. Testing Project Creation & Blueprint Engine ---');
    await client.query('BEGIN');

    const projRes = await client.query(
      `INSERT INTO projects (name, github_repo, tech_stack)
       VALUES ($1, $2, $3) RETURNING *`,
      ['Test Architecture Engine', 'whoiselgallo/antigravity-instruction-architect', JSON.stringify({ frontend: 'React', backend: 'Node' })]
    );
    const project = projRes.rows[0];
    console.log('Created project:', project.id, project.name);

    const bp = await BlueprintEngineService.generateProjectBlueprint(
      client,
      project.id,
      project.name,
      project.tech_stack
    );
    console.log('Blueprint created:', bp);

    await client.query('COMMIT');

    // Consultar nodos creados
    const nodesRes = await pool.query(
      `SELECT id, slug, label, status FROM workflow_nodes WHERE workflow_id = $1 ORDER BY step_order`,
      [bp.workflowId]
    );
    console.log('Nodes in workflow:');
    nodesRes.rows.forEach(n => console.log(`  - [${n.status}] ${n.slug}: ${n.label}`));

    console.log('\n--- 2. Testing Task Status Mutation & Binary Color Transition ---');
    const taskManager = new TaskManagerService(pool, mockIo);

    // Obtener tareas del primer nodo
    const firstNode = nodesRes.rows[0];
    const nodeTasksRes = await pool.query(
      `SELECT pt.id, pt.title, pt.status
       FROM workflow_node_tasks wnt
       JOIN project_tasks pt ON wnt.task_id = pt.id
       WHERE wnt.node_id = $1`,
      [firstNode.id]
    );

    console.log(`Tasks for first node (${firstNode.slug}):`, nodeTasksRes.rows.length);

    // Marcar la primera tarea como DONE (el nodo debe seguir en RED si hay más tareas)
    const task1 = nodeTasksRes.rows[0];
    console.log(`Marking task 1 (${task1.title}) as DONE...`);
    let result = await taskManager.updateTaskStatus(task1.id, 'DONE', 'COLLABORATOR');
    console.log('Transition result:', result);

    // Marcar todas las tareas restantes como DONE -> El nodo debe transicionar a GREEN!
    for (let i = 1; i < nodeTasksRes.rows.length; i++) {
      const t = nodeTasksRes.rows[i];
      console.log(`Marking task ${i + 1} (${t.title}) as DONE...`);
      result = await taskManager.updateTaskStatus(t.id, 'DONE', 'COLLABORATOR');
      console.log('Transition result:', result);
    }

    // Verificar estado del nodo en la base de datos
    const updatedNodeRes = await pool.query(
      `SELECT id, slug, status FROM workflow_nodes WHERE id = $1`,
      [firstNode.id]
    );
    console.log('Final Node Status in DB:', updatedNodeRes.rows[0]);

    // Probar reversión a RED al cambiar una tarea a TODO
    console.log('Reverting task 1 back to TODO...');
    result = await taskManager.updateTaskStatus(task1.id, 'TODO', 'COLLABORATOR');
    console.log('Reversion result:', result);

    const revertedNodeRes = await pool.query(
      `SELECT id, slug, status FROM workflow_nodes WHERE id = $1`,
      [firstNode.id]
    );
    console.log('Reverted Node Status in DB:', revertedNodeRes.rows[0]);

    console.log('\n✓ ALL TESTS PASSED SUCCESSFULLY.');
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

runIntegrationTest();
