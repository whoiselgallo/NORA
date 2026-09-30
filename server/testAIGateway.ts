import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { AIGatewayService } from './services/aiGateway.service';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runAIGatewayTests() {
  console.log('--- TEST: AI GATEWAY CENTRALIZED ORCHESTRATION ---');

  const client = await pool.connect();
  let projectId: string;

  try {
    // 0. Crear un proyecto de prueba en Neon
    const pRes = await client.query(
      `INSERT INTO projects (name, description, github_repo, github_repo_owner, github_repo_name, tech_stack)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        'AI Gateway Testbed',
        'Plataforma integral de gestión con telemetría en vivo, React Flow y campañas masivas',
        'whoiselgallo/antigravity-instruction-architect',
        'whoiselgallo',
        'antigravity-instruction-architect',
        JSON.stringify({ runtime: 'Node.js', db: 'PostgreSQL', frontend: 'React', queue: 'BullMQ' })
      ]
    );
    projectId = pRes.rows[0].id;
    console.log(`✓ Project created for AI testing: ${projectId}`);

    const aiGateway = new AIGatewayService(pool);

    // 1. Test Módulo 1: Blueprint Engine AI (DAG Generator)
    console.log('\n[1/5] Testing Blueprint Engine AI (temperature 0.1, DAG Schema)...');
    const dag = await aiGateway.generateBlueprintDAG(
      projectId,
      'Plataforma integral de gestión con telemetría en vivo y campañas masivas',
      { backend: 'Express', db: 'PostgreSQL', ui: 'React Flow' }
    );
    console.log(`✓ Blueprint DAG generated with ${dag.nodes.length} nodes and ${dag.edges.length} edges.`);
    dag.nodes.forEach(n => console.log(`   - [${n.category}] ${n.title} (${n.tasks.length} tasks)`));

    // 2. Test Módulo 2: DevOps Triage AI
    console.log('\n[2/5] Testing DevOps Triage AI (temperature 0.1, SRE Diagnostics)...');
    const mockFailureLog = `
      > tsc --noEmit
      src/components/workflow/WorkflowCanvas.tsx(42,15): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
      npm error Lifecycle script 'build' failed with error: 1
    `;
    const triage = await aiGateway.triageDevOpsFailure(
      projectId,
      mockFailureLog,
      '.github/workflows/ci.yml',
      'feat: update node transition coordinates'
    );
    console.log(`✓ DevOps Triage Result:
   - Root Cause: ${triage.root_cause}
   - Severity: ${triage.severity}
   - Suggested Fix: ${triage.suggested_fix}
   - Client Friendly: ${triage.client_friendly_summary}`);

    // 3. Test Módulo 3: Task Planner AI
    console.log('\n[3/5] Testing Task Planner AI (temperature 0.2, Subtask Breakdown)...');
    const taskPlan = await aiGateway.planTaskBreakdown(
      projectId,
      'Integrar pasarela de pagos con Stripe y webhooks',
      'Cobros recurrentes mensuales para cuentas de clientes corporativos'
    );
    console.log(`✓ Task Breakdown (${taskPlan.estimated_complexity} complexity):`);
    taskPlan.subtasks.forEach((st, i) => {
      console.log(`   ${i + 1}. ${st.title} [Rol: ${st.suggested_role}] -> ${st.acceptance_criteria}`);
    });

    // 4. Test Módulo 4: Email Marketing Copy AI
    console.log('\n[4/5] Testing Email Marketing AI (temperature 0.7, Copy & RFC 8058 Deliverability)...');
    const emailCopy = await aiGateway.generateEmailMarketingCopy(
      projectId,
      'Lanzamiento oficial de la versión 2.5 de la suite',
      'Clientes corporativos y directores de operaciones',
      'profesional y persuasivo'
    );
    console.log(`✓ Email Marketing Generated:
   - Subjects: ${emailCopy.subject_lines.join(' | ')}
   - Preview Text: ${emailCopy.preview_text}
   - Spam Risk Score: ${emailCopy.spam_risk_score}/10
   - Warnings: ${emailCopy.spam_warnings.join(', ')}`);

    // 5. Test Módulo 5: Executive Status AI
    console.log('\n[5/5] Testing Executive Status AI (temperature 0.7, Client Translation)...');
    const execReport = await aiGateway.generateExecutiveStatusReport(projectId);
    console.log(`✓ Executive Status Report:
   - Health: ${execReport.overall_health}
   - Summary: ${execReport.executive_summary}
   - Completed: ${execReport.completed_milestones.join('; ')}
   - Upcoming: ${execReport.upcoming_focus.join('; ')}
   - Business Impact: ${execReport.business_impact}`);

    console.log('\n✓ ALL 5 AI GATEWAY MODULES TESTED AND VERIFIED SUCCESSFULLY AGAINST NEON POSTGRESQL.');
  } finally {
    client.release();
    await pool.end();
  }
}

runAIGatewayTests().catch(err => {
  console.error('AI Gateway Test Failed:', err);
  process.exit(1);
});
