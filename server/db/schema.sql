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
-- 11. ROW-LEVEL SECURITY (RLS) MULTI-TENANT ISOLATION
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
        'workspace_notes'
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

-- Índices de alto rendimiento
CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_workspace ON project_tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_ws_date ON calendar_events(workspace_id, due_date);
CREATE INDEX IF NOT EXISTS idx_scrum_sprints_ws_proj ON scrum_sprints(workspace_id, project_id);
CREATE INDEX IF NOT EXISTS idx_kanban_columns_ws_proj ON kanban_columns(workspace_id, project_id, position);
CREATE INDEX IF NOT EXISTS idx_workspace_notes_ws ON workspace_notes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_lookup ON marketing_contacts(audience_id, is_subscribed, bounced);
CREATE INDEX IF NOT EXISTS idx_marketing_email_logs_campaign ON marketing_email_logs(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_suppression_email ON marketing_suppression_list(email);
CREATE INDEX IF NOT EXISTS idx_workflow_nodes_order ON workflow_nodes(workflow_id, step_order);
