const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

async function applyMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  console.log('--- MIGRACIÓN: CREACIÓN DE 10 TABLAS FALTANTES & INTEGRACIÓN DMAIC ---');

  try {
    await client.query('BEGIN');

    // =========================================================================
    // 1. SUBSISTEMA 4: WEBHOOK MASTER, TELEMETRÍA E IDEMPOTENCIA (3 TABLAS)
    // =========================================================================
    console.log('[1/4] Creando tablas de Webhooks, Mapeos e Idempotencia...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS project_webhook_configs (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          routing_key VARCHAR(100) UNIQUE NOT NULL,
          secret_hmac VARCHAR(255) NOT NULL,
          allowed_domains TEXT[] DEFAULT ARRAY[]::TEXT[],
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS project_github_mappings (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          repo_owner VARCHAR(100) NOT NULL,
          repo_name VARCHAR(100) NOT NULL,
          default_branch VARCHAR(100) DEFAULT 'main',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_github_owner_repo UNIQUE (repo_owner, repo_name)
      );

      CREATE TABLE IF NOT EXISTS webhook_idempotency_log (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          delivery_id VARCHAR(100) UNIQUE NOT NULL,
          event_type VARCHAR(50) NOT NULL,
          processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          status VARCHAR(20) NOT NULL DEFAULT 'PROCESSED'
      );
    `);

    // =========================================================================
    // 2. SUBSISTEMA 6: GESTIÓN DE PROYECTOS DMAIC - LEAN SIX SIGMA (6 TABLAS)
    // =========================================================================
    console.log('[2/4] Creando tablas normalizadas del ciclo DMAIC...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS dmaic_projects (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          active_phase VARCHAR(20) NOT NULL DEFAULT 'DEFINE' CHECK (active_phase IN ('DEFINE', 'MEASURE', 'ANALYZE', 'IMPROVE', 'CONTROL')),
          champion_id UUID REFERENCES users(id) ON DELETE SET NULL,
          leader_id UUID REFERENCES users(id) ON DELETE SET NULL,
          target_completion_date DATE,
          baseline_metric_name VARCHAR(150),
          baseline_value NUMERIC(12, 4),
          target_value NUMERIC(12, 4),
          current_value NUMERIC(12, 4),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_dmaic_project UNIQUE (project_id)
      );

      CREATE TABLE IF NOT EXISTS dmaic_define_phase (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          dmaic_id UUID NOT NULL REFERENCES dmaic_projects(id) ON DELETE CASCADE,
          problem_statement TEXT,
          business_case TEXT,
          goal_statement TEXT,
          scope_in_boundary TEXT,
          scope_out_boundary TEXT,
          sipoc JSONB DEFAULT '{"suppliers": [], "inputs": [], "process": [], "outputs": [], "customers": []}'::jsonb,
          tollgate_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (tollgate_status IN ('PENDING', 'APPROVED', 'REJECTED')),
          approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
          approved_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_define_dmaic UNIQUE (dmaic_id)
      );

      CREATE TABLE IF NOT EXISTS dmaic_measure_phase (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          dmaic_id UUID NOT NULL REFERENCES dmaic_projects(id) ON DELETE CASCADE,
          data_collection_plan TEXT,
          sample_size INTEGER DEFAULT 0,
          defects_count INTEGER DEFAULT 0,
          opportunities_per_unit INTEGER DEFAULT 1,
          dpmo NUMERIC(12, 2) DEFAULT 0,
          sigma_level NUMERIC(5, 2) DEFAULT 6.0,
          cp_index NUMERIC(5, 2),
          cpk_index NUMERIC(5, 2),
          tollgate_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (tollgate_status IN ('PENDING', 'APPROVED', 'REJECTED')),
          approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
          approved_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_measure_dmaic UNIQUE (dmaic_id)
      );

      CREATE TABLE IF NOT EXISTS dmaic_analyze_phase (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          dmaic_id UUID NOT NULL REFERENCES dmaic_projects(id) ON DELETE CASCADE,
          ishikawa_diagram_id UUID REFERENCES opex_ishikawa_diagrams(id) ON DELETE SET NULL,
          five_whys_id UUID REFERENCES opex_five_whys(id) ON DELETE SET NULL,
          root_causes_summary TEXT,
          verified_hypotheses JSONB DEFAULT '[]'::jsonb,
          tollgate_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (tollgate_status IN ('PENDING', 'APPROVED', 'REJECTED')),
          approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
          approved_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_analyze_dmaic UNIQUE (dmaic_id)
      );

      CREATE TABLE IF NOT EXISTS dmaic_improve_phase (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          dmaic_id UUID NOT NULL REFERENCES dmaic_projects(id) ON DELETE CASCADE,
          impact_effort_matrix JSONB DEFAULT '[]'::jsonb,
          fmea_analysis JSONB DEFAULT '[]'::jsonb,
          pilot_results TEXT,
          action_plan_tasks UUID[] DEFAULT ARRAY[]::UUID[],
          tollgate_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (tollgate_status IN ('PENDING', 'APPROVED', 'REJECTED')),
          approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
          approved_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_improve_dmaic UNIQUE (dmaic_id)
      );

      CREATE TABLE IF NOT EXISTS dmaic_control_phase (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          dmaic_id UUID NOT NULL REFERENCES dmaic_projects(id) ON DELETE CASCADE,
          control_plan_summary TEXT,
          sop_documents UUID[] DEFAULT ARRAY[]::UUID[],
          realized_annual_savings NUMERIC(14, 2) DEFAULT 0,
          monitoring_telemetry_query TEXT,
          tolerance_min_duration_ms INTEGER DEFAULT 0,
          tolerance_max_duration_ms INTEGER DEFAULT 300000,
          min_success_rate NUMERIC(5, 2) DEFAULT 95.0,
          tollgate_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (tollgate_status IN ('PENDING', 'APPROVED', 'REJECTED')),
          approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
          approved_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_control_dmaic UNIQUE (dmaic_id)
      );
    `);

    // =========================================================================
    // 3. SUBSISTEMA 8: ENTREGABLES CORPORATIVOS TSOLUTIONS IPIDD (1 TABLA)
    // =========================================================================
    console.log('[3/4] Creando tabla de Entregables Corporativos...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS corporate_deliverables (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
          dmaic_id UUID REFERENCES dmaic_projects(id) ON DELETE SET NULL,
          deliverable_type VARCHAR(50) NOT NULL CHECK (deliverable_type IN ('EXECUTIVE_MINUTES', 'CLOSURE_RECORD', 'SOP_STANDARD', 'TECHNICAL_MEMO', 'PROJECT_CHARTER')),
          title VARCHAR(200) NOT NULL,
          content_markdown TEXT NOT NULL,
          brand_tokens_applied JSONB NOT NULL DEFAULT '{}'::jsonb,
          author_id UUID REFERENCES users(id) ON DELETE SET NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'AUDITED', 'APPROVED', 'DELIVERED')),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // =========================================================================
    // 4. MIGRACIÓN DE DATOS DE DMAIC_PHASES -> DMAIC_PROJECTS & FASES
    // =========================================================================
    console.log('[4/4] Migrando registros existentes de dmaic_phases a la estructura normalizada...');
    const existingPhases = await client.query(`SELECT * FROM dmaic_phases ORDER BY project_id, phase`);
    
    // Proyectos distintos
    const projectIds = [...new Set(existingPhases.rows.map(r => r.project_id))];

    for (const pid of projectIds) {
      const pRows = existingPhases.rows.filter(r => r.project_id === pid);
      const wsId = pRows[0].workspace_id;
      
      // Determinar la fase activa (la primera no aprobada, o 'CONTROL')
      let activePhase = 'CONTROL';
      for (const phaseName of ['DEFINE', 'MEASURE', 'ANALYZE', 'IMPROVE', 'CONTROL']) {
        const row = pRows.find(r => r.phase === phaseName);
        if (!row || row.tollgate_status !== 'APPROVED') {
          activePhase = phaseName;
          break;
        }
      }

      // Insertar en dmaic_projects
      const dmaicProjRes = await client.query(
        `INSERT INTO dmaic_projects (workspace_id, project_id, active_phase, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (project_id) DO UPDATE SET active_phase = EXCLUDED.active_phase
         RETURNING id`,
        [wsId, pid, activePhase, pRows[0].created_at, pRows[0].updated_at || pRows[0].created_at]
      );
      const dmaicId = dmaicProjRes.rows[0].id;

      // Migrar cada fase individual
      for (const row of pRows) {
        if (row.phase === 'DEFINE') {
          await client.query(
            `INSERT INTO dmaic_define_phase (
               dmaic_id, problem_statement, business_case, goal_statement, scope_in_boundary, sipoc, tollgate_status, approved_by, approved_at, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (dmaic_id) DO NOTHING`,
            [
              dmaicId,
              row.charter_problem_statement,
              row.charter_business_case,
              row.charter_goal,
              row.charter_scope,
              row.sipoc_data || {},
              row.tollgate_status,
              row.approved_by,
              row.approved_at,
              row.created_at
            ]
          );
        } else if (row.phase === 'MEASURE') {
          const metrics = row.measure_baseline_metrics || {};
          await client.query(
            `INSERT INTO dmaic_measure_phase (
               dmaic_id, dpmo, sigma_level, tollgate_status, approved_by, approved_at, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (dmaic_id) DO NOTHING`,
            [
              dmaicId,
              metrics.dpmo || 0,
              metrics.sigma_level || 6.0,
              row.tollgate_status,
              row.approved_by,
              row.approved_at,
              row.created_at
            ]
          );
        } else if (row.phase === 'ANALYZE') {
          await client.query(
            `INSERT INTO dmaic_analyze_phase (
               dmaic_id, verified_hypotheses, tollgate_status, approved_by, approved_at, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (dmaic_id) DO NOTHING`,
            [
              dmaicId,
              row.analyze_findings || [],
              row.tollgate_status,
              row.approved_by,
              row.approved_at,
              row.created_at
            ]
          );
        } else if (row.phase === 'IMPROVE') {
          await client.query(
            `INSERT INTO dmaic_improve_phase (
               dmaic_id, impact_effort_matrix, tollgate_status, approved_by, approved_at, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (dmaic_id) DO NOTHING`,
            [
              dmaicId,
              row.improve_action_plan || [],
              row.tollgate_status,
              row.approved_by,
              row.approved_at,
              row.created_at
            ]
          );
        } else if (row.phase === 'CONTROL') {
          const cplan = row.control_plan || {};
          await client.query(
            `INSERT INTO dmaic_control_phase (
               dmaic_id, tolerance_min_duration_ms, tolerance_max_duration_ms, min_success_rate, tollgate_status, approved_by, approved_at, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (dmaic_id) DO NOTHING`,
            [
              dmaicId,
              cplan.tolerance_min_duration_ms || 0,
              cplan.tolerance_max_duration_ms || 300000,
              cplan.min_success_rate || 95.0,
              row.tollgate_status,
              row.approved_by,
              row.approved_at,
              row.created_at
            ]
          );
        }
      }
    }

    console.log(`✓ Migración de datos completada para ${projectIds.length} proyectos DMAIC.`);

    // Eliminar la tabla dmaic_phases para dejar limpio el catálogo de 46 tablas
    await client.query(`DROP TABLE IF EXISTS dmaic_phases CASCADE;`);
    console.log('✓ Tabla legacy dmaic_phases eliminada tras migración exitosa.');

    // =========================================================================
    // 5. HABILITAR ROW LEVEL SECURITY (RLS) EN LAS NUEVAS TABLAS
    // =========================================================================
    console.log('Aplicando Row-Level Security (RLS) a las nuevas tablas...');
    const directWorkspaceTables = [
      'project_webhook_configs',
      'project_github_mappings',
      'webhook_idempotency_log',
      'dmaic_projects',
      'corporate_deliverables'
    ];

    for (const tbl of directWorkspaceTables) {
      await client.query(`ALTER TABLE ${tbl} ENABLE ROW LEVEL SECURITY;`);
      await client.query(`DROP POLICY IF EXISTS ${tbl}_workspace_isolation_policy ON ${tbl};`);
      await client.query(`
        CREATE POLICY ${tbl}_workspace_isolation_policy ON ${tbl}
        FOR ALL
        USING (
          current_setting('app.bypass_rls', true) = 'on'
          OR workspace_id = get_current_workspace_id()
        )
        WITH CHECK (
          current_setting('app.bypass_rls', true) = 'on'
          OR workspace_id = get_current_workspace_id()
        );
      `);
    }

    const dmaicPhaseTables = [
      'dmaic_define_phase',
      'dmaic_measure_phase',
      'dmaic_analyze_phase',
      'dmaic_improve_phase',
      'dmaic_control_phase'
    ];

    for (const tbl of dmaicPhaseTables) {
      await client.query(`ALTER TABLE ${tbl} ENABLE ROW LEVEL SECURITY;`);
      await client.query(`DROP POLICY IF EXISTS ${tbl}_workspace_isolation_policy ON ${tbl};`);
      await client.query(`
        CREATE POLICY ${tbl}_workspace_isolation_policy ON ${tbl}
        FOR ALL
        USING (
          current_setting('app.bypass_rls', true) = 'on'
          OR dmaic_id IN (
            SELECT id FROM dmaic_projects 
            WHERE workspace_id = get_current_workspace_id()
          )
        )
        WITH CHECK (
          current_setting('app.bypass_rls', true) = 'on'
          OR dmaic_id IN (
            SELECT id FROM dmaic_projects 
            WHERE workspace_id = get_current_workspace_id()
          )
        );
      `);
    }

    await client.query('COMMIT');
    console.log('✓ Transacción de migración completada exitosamente.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ERROR en migración:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration();
