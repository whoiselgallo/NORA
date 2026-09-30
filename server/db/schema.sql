-- FASE 1: MODELADO RELACIONAL COMPLETO & MULTI-TENANT WORKSPACES

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tipos enumerados
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('ADMIN', 'COLLABORATOR', 'CLIENT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE task_status AS ENUM ('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE task_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE node_status AS ENUM ('RED', 'GREEN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE node_category AS ENUM ('infra', 'backend', 'frontend', 'devops', 'qa', 'marketing');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE telemetry_event_type AS ENUM ('workflow_run', 'pull_request', 'push');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE campaign_status AS ENUM ('DRAFT', 'SCHEDULED', 'PROCESSING', 'COMPLETED', 'PAUSED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE email_log_status AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'SPAM_REPORT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE suppression_reason AS ENUM ('UNSUBSCRIBED', 'HARD_BOUNCE', 'SPAM_COMPLAINT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE sprint_status AS ENUM ('PLANNING', 'ACTIVE', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE dependency_type AS ENUM ('FS', 'SS', 'FF', 'SF');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE ishikawa_category AS ENUM ('MANPOWER', 'MACHINERY', 'METHODS', 'MATERIALS', 'MEASUREMENT', 'ENVIRONMENT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE swot_type AS ENUM ('STRENGTH', 'WEAKNESS', 'OPPORTUNITY', 'THREAT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 1. Usuarios y Workspaces (Multi-Tenant Isolation)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role user_role NOT NULL DEFAULT 'COLLABORATOR',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workspace_members (
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'COLLABORATOR',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (workspace_id, user_id)
);

-- Workspace Enterprise Predeterminado para retrocompatibilidad
INSERT INTO workspaces (id, name, slug, description)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Enterprise Workspace', 'default-enterprise', 'Espacio de trabajo principal predeterminado')
ON CONFLICT (id) DO NOTHING;

-- 2. Proyectos
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    github_repo VARCHAR(255),
    github_repo_owner VARCHAR(100),
    github_repo_name VARCHAR(100),
    tech_stack JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE projects SET workspace_id = '00000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;

CREATE TABLE IF NOT EXISTS project_members (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, user_id)
);

-- 3. Tareas de Proyecto (Integradas con Sprint, Kanban, Gantt y Calendario)
CREATE TABLE IF NOT EXISTS project_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    sprint_id UUID,
    kanban_column_id UUID,
    kanban_position INTEGER DEFAULT 0,
    story_points INTEGER DEFAULT 0,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status task_status NOT NULL DEFAULT 'TODO',
    priority task_priority NOT NULL DEFAULT 'MEDIUM',
    start_date TIMESTAMP WITH TIME ZONE,
    due_date TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS sprint_id UUID;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS kanban_column_id UUID;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS kanban_position INTEGER DEFAULT 0;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS story_points INTEGER DEFAULT 0;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS start_date TIMESTAMP WITH TIME ZONE;
UPDATE project_tasks pt SET workspace_id = p.workspace_id FROM projects p WHERE pt.project_id = p.id AND pt.workspace_id IS NULL;
UPDATE project_tasks SET workspace_id = '00000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;

-- 4. Calendario Maestro y Alertas Centralizadas
CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    event_type VARCHAR(50) NOT NULL DEFAULT 'TASK',
    reference_id UUID,
    priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    alert_triggered BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Herramientas Ágiles (Scrum, Kanban, Gantt)
CREATE TABLE IF NOT EXISTS scrum_sprints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    goal TEXT,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status sprint_status NOT NULL DEFAULT 'PLANNING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kanban_columns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    wip_limit INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_kanban_col_pos UNIQUE (project_id, position)
);

CREATE TABLE IF NOT EXISTS gantt_dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    predecessor_id UUID NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
    successor_id UUID NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
    dependency_type dependency_type NOT NULL DEFAULT 'FS',
    lag_days INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_gantt_dependency UNIQUE (predecessor_id, successor_id)
);

-- 6. Herramientas OPEX y de Calidad
CREATE TABLE IF NOT EXISTS opex_five_whys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    problem TEXT NOT NULL,
    why_1 TEXT NOT NULL,
    why_2 TEXT,
    why_3 TEXT,
    why_4 TEXT,
    why_5 TEXT,
    root_cause TEXT NOT NULL,
    corrective_task_id UUID REFERENCES project_tasks(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS opex_ishikawa_diagrams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    problem_statement TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS opex_ishikawa_factors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    diagram_id UUID NOT NULL REFERENCES opex_ishikawa_diagrams(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    category ishikawa_category NOT NULL,
    factor_text TEXT NOT NULL,
    weight INTEGER NOT NULL DEFAULT 1,
    votes INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS opex_swot_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type swot_type NOT NULL,
    description TEXT NOT NULL,
    impact_level VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    score INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS opex_pareto_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    frequency INTEGER NOT NULL DEFAULT 0,
    cost NUMERIC(12,2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Block de Notas Colaborativo
CREATE TABLE IF NOT EXISTS workspace_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    tags TEXT[] NOT NULL DEFAULT '{}',
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Telemetría GitHub & Webhook Master
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

CREATE TABLE IF NOT EXISTS github_telemetry_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    event_action VARCHAR(50),
    status VARCHAR(50),
    delivery_id VARCHAR(100),
    duration_seconds INTEGER,
    commit_sha VARCHAR(40),
    branch VARCHAR(100),
    conclusion VARCHAR(50),
    duration_ms INTEGER,
    latency_ms INTEGER,
    author VARCHAR(100),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE github_telemetry_events ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE github_telemetry_events ALTER COLUMN event_type TYPE VARCHAR(100);
ALTER TABLE github_telemetry_events ADD COLUMN IF NOT EXISTS author VARCHAR(100);
ALTER TABLE github_telemetry_events ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE github_telemetry_events ADD COLUMN IF NOT EXISTS status VARCHAR(50);
ALTER TABLE github_telemetry_events ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
ALTER TABLE github_telemetry_events ADD COLUMN IF NOT EXISTS received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- 9. Workflow DAG
CREATE TABLE IF NOT EXISTS project_workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
    name VARCHAR(255) DEFAULT 'Primary Workflow',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workflow_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES project_workflows(id) ON DELETE CASCADE,
    slug VARCHAR(100),
    title VARCHAR(255) NOT NULL,
    label VARCHAR(255),
    description TEXT,
    category node_category NOT NULL DEFAULT 'infra',
    step_order INTEGER DEFAULT 1,
    position_x FLOAT NOT NULL DEFAULT 0.0,
    position_y FLOAT NOT NULL DEFAULT 0.0,
    status node_status NOT NULL DEFAULT 'RED',
    is_automated_github BOOLEAN NOT NULL DEFAULT false,
    github_trigger_event VARCHAR(100),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workflow_edges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES project_workflows(id) ON DELETE CASCADE,
    source_node_id UUID NOT NULL REFERENCES workflow_nodes(id) ON DELETE CASCADE,
    target_node_id UUID NOT NULL REFERENCES workflow_nodes(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_workflow_edge UNIQUE (workflow_id, source_node_id, target_node_id)
);

CREATE TABLE IF NOT EXISTS workflow_node_tasks (
    node_id UUID NOT NULL REFERENCES workflow_nodes(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (node_id, task_id)
);

-- 10. Módulo de Marketing
CREATE TABLE IF NOT EXISTS marketing_audiences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS marketing_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    audience_id UUID NOT NULL REFERENCES marketing_audiences(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    custom_metadata JSONB DEFAULT '{}'::jsonb,
    is_subscribed BOOLEAN NOT NULL DEFAULT true,
    unsubscribed_at TIMESTAMP WITH TIME ZONE,
    bounced BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_audience_contact_email UNIQUE (audience_id, email)
);

CREATE TABLE IF NOT EXISTS marketing_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    preview_text VARCHAR(255),
    html_body TEXT NOT NULL,
    plain_text_body TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE marketing_audiences ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE marketing_templates ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS marketing_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES marketing_templates(id) ON DELETE RESTRICT,
    audience_id UUID NOT NULL REFERENCES marketing_audiences(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    status campaign_status NOT NULL DEFAULT 'DRAFT',
    total_recipients INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    delivered_count INTEGER NOT NULL DEFAULT 0,
    opened_count INTEGER NOT NULL DEFAULT 0,
    clicked_count INTEGER NOT NULL DEFAULT 0,
    bounced_count INTEGER NOT NULL DEFAULT 0,
    complained_count INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS marketing_email_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES marketing_contacts(id) ON DELETE CASCADE,
    message_id VARCHAR(255),
    status email_log_status NOT NULL DEFAULT 'PENDING',
    sent_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS marketing_suppression_list (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    reason suppression_reason NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 11. DIAPOSITIVAS EJECUTIVAS ASISTIDAS POR IA (TSOLUTIONS IPIDD STYLE)
-- ============================================================================
CREATE TABLE IF NOT EXISTS presentation_decks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    aspect_ratio VARCHAR(10) DEFAULT '16:9',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS presentation_slides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deck_id UUID NOT NULL REFERENCES presentation_decks(id) ON DELETE CASCADE,
    slide_index INTEGER NOT NULL,
    layout_type VARCHAR(50) NOT NULL CHECK (
        layout_type IN (
            'HERO_COVER', 
            'TWO_COLUMN', 
            'THREE_CARD_KPI', 
            'TIMELINE_ROADMAP', 
            'OPEX_PROBLEM_STATEMENT', 
            'CODE_AND_ARCHITECTURE', 
            'CONCLUSION_CTA'
        )
    ),
    slide_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 13. Módulo DMAIC Six Sigma Normalizado (6 Tablas)
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

-- 14. Entregables Corporativos TSolutions IPIDD (Brand Enforcer)
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

ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS release_tag VARCHAR(100);
ALTER TABLE opex_ishikawa_factors ADD COLUMN IF NOT EXISTS is_critical BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE opex_ishikawa_factors ADD COLUMN IF NOT EXISTS corrective_task_id UUID REFERENCES project_tasks(id) ON DELETE SET NULL;

-- ============================================================================
-- 12. ROW-LEVEL SECURITY (RLS) MULTI-TENANT ISOLATION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_current_workspace_id() RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_workspace_id', true), '')::UUID;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Macro de RLS por tabla
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'projects',
        'project_tasks',
        'calendar_events',
        'scrum_sprints',
        'kanban_columns',
        'gantt_dependencies',
        'opex_five_whys',
        'opex_ishikawa_diagrams',
        'opex_ishikawa_factors',
        'opex_swot_items',
        'opex_pareto_data',
        'workspace_notes',
        'presentation_decks',
        'project_webhook_configs',
        'project_github_mappings',
        'webhook_idempotency_log',
        'dmaic_projects',
        'corporate_deliverables'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', tbl || '_workspace_isolation_policy', tbl);
        EXECUTE format('
            CREATE POLICY %I ON %I
            FOR ALL
            USING (
                current_setting(''app.bypass_rls'', true) = ''on''
                OR workspace_id = get_current_workspace_id()
            )
            WITH CHECK (
                current_setting(''app.bypass_rls'', true) = ''on''
                OR workspace_id = get_current_workspace_id()
            );
        ', tbl || '_workspace_isolation_policy', tbl);
    END LOOP;
END $$;

-- RLS específico para fases DMAIC vinculadas por dmaic_id
DO $$
DECLARE
    dmaic_tbl text;
    dmaic_phase_tables text[] := ARRAY[
        'dmaic_define_phase',
        'dmaic_measure_phase',
        'dmaic_analyze_phase',
        'dmaic_improve_phase',
        'dmaic_control_phase'
    ];
BEGIN
    FOREACH dmaic_tbl IN ARRAY dmaic_phase_tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', dmaic_tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', dmaic_tbl || '_workspace_isolation_policy', dmaic_tbl);
        EXECUTE format('
            CREATE POLICY %I ON %I
            FOR ALL
            USING (
                current_setting(''app.bypass_rls'', true) = ''on''
                OR dmaic_id IN (
                    SELECT id FROM dmaic_projects 
                    WHERE workspace_id = get_current_workspace_id()
                )
            )
            WITH CHECK (
                current_setting(''app.bypass_rls'', true) = ''on''
                OR dmaic_id IN (
                    SELECT id FROM dmaic_projects 
                    WHERE workspace_id = get_current_workspace_id()
                )
            );
        ', dmaic_tbl || '_workspace_isolation_policy', dmaic_tbl);
    END LOOP;
END $$;

-- RLS específico para presentation_slides vinculado por deck_id
ALTER TABLE presentation_slides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS presentation_slides_workspace_isolation_policy ON presentation_slides;
CREATE POLICY presentation_slides_workspace_isolation_policy ON presentation_slides
FOR ALL
USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR deck_id IN (
        SELECT id FROM presentation_decks 
        WHERE workspace_id = get_current_workspace_id()
    )
)
WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR deck_id IN (
        SELECT id FROM presentation_decks 
        WHERE workspace_id = get_current_workspace_id()
    )
);

-- Índices de alto rendimiento
CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_workspace ON project_tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_ws_date ON calendar_events(workspace_id, due_date);
CREATE INDEX IF NOT EXISTS idx_scrum_sprints_ws_proj ON scrum_sprints(workspace_id, project_id);
CREATE INDEX IF NOT EXISTS idx_kanban_columns_ws_proj ON kanban_columns(workspace_id, project_id, position);
CREATE INDEX IF NOT EXISTS idx_workspace_notes_ws ON workspace_notes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_presentation_decks_ws ON presentation_decks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_presentation_slides_deck_index ON presentation_slides(deck_id, slide_index ASC);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_lookup ON marketing_contacts(audience_id, is_subscribed, bounced);
CREATE INDEX IF NOT EXISTS idx_marketing_email_logs_campaign ON marketing_email_logs(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_suppression_email ON marketing_suppression_list(email);
CREATE INDEX IF NOT EXISTS idx_workflow_nodes_order ON workflow_nodes(workflow_id, step_order);

-- ============================================================================
-- 14. CIERRE FORMAL, SNAPSHOT INMUTABLE & CEREBRO VECTORIAL NEXUS (PGVECTOR)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE';
DO $$ BEGIN
    ALTER TABLE projects ADD CONSTRAINT chk_project_status CHECK (status IN ('ACTIVE', 'IN_PROGRESS', 'ARCHIVED'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Registro de Cierre Formal y Acta Ejecutiva
CREATE TABLE IF NOT EXISTS project_closures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
    closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    closed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    client_sign_off_name VARCHAR(255) NOT NULL,
    client_feedback_rating INTEGER NOT NULL CHECK (client_feedback_rating BETWEEN 1 AND 5),
    client_comments TEXT,
    final_roi_amount NUMERIC(15,2) DEFAULT 0.00,
    final_cycle_time_days NUMERIC(10,2) DEFAULT 0.00,
    final_sigma_level NUMERIC(5,2) DEFAULT 6.00,
    closure_certificate_pdf TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Captura integral inmutable en JSONB
CREATE TABLE IF NOT EXISTS project_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
    snapshot_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Memoria continua asistida por pgvector
CREATE TABLE IF NOT EXISTS nexus_knowledge_vectors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    knowledge_domain VARCHAR(50) NOT NULL CHECK (
        knowledge_domain IN (
            'ARCHITECTURE_STACK',
            'OPEX_ROOT_CAUSE',
            'METRICS_AND_ROI',
            'LESSONS_LEARNED',
            'SOP_PROCEDURES',
            'DOCUMENT_INGESTION'
        )
    ),
    title VARCHAR(200) NOT NULL,
    raw_content TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    embedding vector(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices HNSW y B-Tree optimizados para consultas en <100ms
CREATE INDEX IF NOT EXISTS idx_nexus_knowledge_vectors_hnsw 
    ON nexus_knowledge_vectors USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_nexus_vectors_workspace 
    ON nexus_knowledge_vectors(workspace_id);
CREATE INDEX IF NOT EXISTS idx_nexus_vectors_ws_domain 
    ON nexus_knowledge_vectors(workspace_id, knowledge_domain);
CREATE INDEX IF NOT EXISTS idx_nexus_vectors_project 
    ON nexus_knowledge_vectors(project_id);
CREATE INDEX IF NOT EXISTS idx_project_closures_ws 
    ON project_closures(workspace_id);
CREATE INDEX IF NOT EXISTS idx_project_snapshots_ws 
    ON project_snapshots(workspace_id);
CREATE INDEX IF NOT EXISTS idx_projects_status 
    ON projects(workspace_id, status);

-- Row-Level Security para Cierres, Snapshots y Vectores
ALTER TABLE project_closures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_closures_workspace_isolation_policy ON project_closures;
CREATE POLICY project_closures_workspace_isolation_policy ON project_closures
FOR ALL
USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR workspace_id = get_current_workspace_id()
)
WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR workspace_id = get_current_workspace_id()
);

ALTER TABLE project_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_snapshots_workspace_isolation_policy ON project_snapshots;
CREATE POLICY project_snapshots_workspace_isolation_policy ON project_snapshots
FOR ALL
USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR workspace_id = get_current_workspace_id()
)
WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR workspace_id = get_current_workspace_id()
);

ALTER TABLE nexus_knowledge_vectors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nexus_knowledge_vectors_workspace_isolation_policy ON nexus_knowledge_vectors;
CREATE POLICY nexus_knowledge_vectors_workspace_isolation_policy ON nexus_knowledge_vectors
FOR ALL
USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR workspace_id = get_current_workspace_id()
)
WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR workspace_id = get_current_workspace_id()
);

-- ============================================================================
-- 15. NEXUS ARCHITECT STUDIO: INTEGRACIONES, IMPORTADOR & DOCUMENTOS
-- ============================================================================

-- Integraciones Nativas con credenciales cifradas AES-256-GCM
CREATE TABLE IF NOT EXISTS workspace_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('github', 'gitlab', 'google_tasks')),
    auth_type VARCHAR(50) NOT NULL DEFAULT 'OAUTH2',
    encrypted_credentials TEXT NOT NULL,
    iv VARCHAR(50) NOT NULL,
    tag VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_workspace_provider UNIQUE (workspace_id, provider)
);

-- Mapeo de sincronización bidireccional con Google Tasks
CREATE TABLE IF NOT EXISTS google_tasks_sync_map (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_task_id UUID NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
    google_task_id VARCHAR(255) NOT NULL,
    google_tasklist_id VARCHAR(255) NOT NULL,
    sync_hash VARCHAR(64),
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_task_google_sync UNIQUE (project_task_id)
);

-- Registro de auditoría del Motor de Importación Universal
CREATE TABLE IF NOT EXISTS project_imports_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_format VARCHAR(50) NOT NULL,
    total_rows INTEGER NOT NULL DEFAULT 0,
    imported_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    mapping_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Gestión documental y asimilación para Nexus
CREATE TABLE IF NOT EXISTS workspace_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    parsing_status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (parsing_status IN ('PENDING', 'PARSING', 'INDEXED', 'FAILED')),
    error_message TEXT,
    total_chunks INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Extensiones y columnas para vincular vectores de conocimiento a documentos
ALTER TABLE nexus_knowledge_vectors ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES workspace_documents(id) ON DELETE CASCADE;
ALTER TABLE nexus_knowledge_vectors ADD COLUMN IF NOT EXISTS chunk_index INTEGER DEFAULT 0;
ALTER TABLE nexus_knowledge_vectors ALTER COLUMN project_id DROP NOT NULL;

-- Habilitar RLS en las nuevas tablas operativas
DO $$
DECLARE
    tbl text;
    new_tables text[] := ARRAY[
        'workspace_integrations',
        'google_tasks_sync_map',
        'project_imports_log',
        'workspace_documents'
    ];
BEGIN
    FOREACH tbl IN ARRAY new_tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', tbl || '_workspace_isolation_policy', tbl);
        EXECUTE format('
            CREATE POLICY %I ON %I
            FOR ALL
            USING (
                current_setting(''app.bypass_rls'', true) = ''on''
                OR workspace_id = get_current_workspace_id()
            )
            WITH CHECK (
                current_setting(''app.bypass_rls'', true) = ''on''
                OR workspace_id = get_current_workspace_id()
            );
        ', tbl || '_workspace_isolation_policy', tbl);
    END LOOP;
END $$;

-- Índices de alto rendimiento
CREATE INDEX IF NOT EXISTS idx_workspace_integrations_lookup ON workspace_integrations(workspace_id, provider);
CREATE INDEX IF NOT EXISTS idx_google_tasks_sync_lookup ON google_tasks_sync_map(workspace_id, google_task_id);
CREATE INDEX IF NOT EXISTS idx_workspace_documents_ws ON workspace_documents(workspace_id, parsing_status);
CREATE INDEX IF NOT EXISTS idx_nexus_vectors_doc ON nexus_knowledge_vectors(document_id);

-- Actualizar restricción de dominio para soportar DOCUMENT_INGESTION
ALTER TABLE nexus_knowledge_vectors DROP CONSTRAINT IF EXISTS nexus_knowledge_vectors_knowledge_domain_check;
ALTER TABLE nexus_knowledge_vectors ADD CONSTRAINT nexus_knowledge_vectors_knowledge_domain_check
CHECK (knowledge_domain IN ('ARCHITECTURE_STACK', 'OPEX_ROOT_CAUSE', 'METRICS_AND_ROI', 'LESSONS_LEARNED', 'SOP_PROCEDURES', 'DOCUMENT_INGESTION'));

-- ============================================================================
-- 16. ONBOARDING INTELIGENTE, CONTRATOS OFICIALES & WEBHOOKS CI/CD
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_service_catalog (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain VARCHAR(100) NOT NULL,
    archetype VARCHAR(50) NOT NULL,
    package_name VARCHAR(150) NOT NULL,
    package_code VARCHAR(100) UNIQUE NOT NULL,
    price_amount NUMERIC(12,2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'MXN',
    billing_scheme VARCHAR(50) NOT NULL DEFAULT 'ONE_TIME',
    maintenance_fee NUMERIC(12,2) DEFAULT 0.00,
    description TEXT NOT NULL,
    contract_template_type VARCHAR(100) NOT NULL,
    estimated_delivery_days INTEGER NOT NULL DEFAULT 14,
    tech_stack_preset JSONB NOT NULL DEFAULT '{}'::jsonb,
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS corporate_deliverables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    deliverable_type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content_html TEXT NOT NULL,
    content_markdown TEXT,
    pdf_storage_url TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_webhook_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
    provider VARCHAR(50) NOT NULL DEFAULT 'github',
    routing_key VARCHAR(100) UNIQUE NOT NULL,
    secret_token VARCHAR(255) NOT NULL,
    webhook_url TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE system_service_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_catalog_public_read ON system_service_catalog;
CREATE POLICY service_catalog_public_read ON system_service_catalog FOR SELECT USING (true);

ALTER TABLE corporate_deliverables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS corporate_deliverables_workspace_policy ON corporate_deliverables;
CREATE POLICY corporate_deliverables_workspace_policy ON corporate_deliverables
    FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'on' OR workspace_id = get_current_workspace_id())
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR workspace_id = get_current_workspace_id());

ALTER TABLE project_webhook_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_webhook_configs_workspace_policy ON project_webhook_configs;
CREATE POLICY project_webhook_configs_workspace_policy ON project_webhook_configs
    FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'on' OR workspace_id = get_current_workspace_id())
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR workspace_id = get_current_workspace_id());

CREATE INDEX IF NOT EXISTS idx_service_catalog_domain ON system_service_catalog(domain, archetype);
CREATE INDEX IF NOT EXISTS idx_corp_deliverables_ws_proj ON corporate_deliverables(workspace_id, project_id);
CREATE INDEX IF NOT EXISTS idx_webhook_configs_routing ON project_webhook_configs(routing_key);
CREATE INDEX IF NOT EXISTS idx_webhook_configs_ws_proj ON project_webhook_configs(workspace_id, project_id);


