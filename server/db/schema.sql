-- FASE 1: MODELADO RELACIONAL COMPLETO

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

-- 1. Usuarios y Accesos
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role user_role NOT NULL DEFAULT 'COLLABORATOR',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    github_repo VARCHAR(255),
    github_repo_owner VARCHAR(100),
    github_repo_name VARCHAR(100),
    tech_stack JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_members (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, user_id)
);

-- 2. Tareas Manuales (To-Do)
CREATE TABLE IF NOT EXISTS project_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status task_status NOT NULL DEFAULT 'TODO',
    priority task_priority NOT NULL DEFAULT 'MEDIUM',
    due_date TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Telemetría GitHub
CREATE TABLE IF NOT EXISTS github_telemetry_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    event_type telemetry_event_type NOT NULL,
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

-- 4. Pizarrón y Workflow Dinámico (DAG)
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
    step_order INTEGER NOT NULL DEFAULT 1,
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

-- 5. Módulo de Marketing y Envíos Masivos
CREATE TABLE IF NOT EXISTS marketing_audiences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
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

-- Actualización de columnas en tablas existentes si ya fueron creadas
ALTER TABLE workflow_nodes ALTER COLUMN slug DROP NOT NULL;
ALTER TABLE workflow_nodes ALTER COLUMN step_order DROP NOT NULL;
ALTER TABLE workflow_nodes ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE workflow_nodes ADD COLUMN IF NOT EXISTS category node_category DEFAULT 'infra';
ALTER TABLE workflow_nodes ADD COLUMN IF NOT EXISTS github_trigger_event VARCHAR(100);
ALTER TABLE workflow_nodes ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;
UPDATE workflow_nodes SET title = label WHERE title IS NULL AND label IS NOT NULL;
UPDATE workflow_nodes SET label = title WHERE label IS NULL AND title IS NOT NULL;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_repo_owner VARCHAR(100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_repo_name VARCHAR(100);

ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS priority task_priority DEFAULT 'MEDIUM';

-- Índices de alto rendimiento
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_lookup ON marketing_contacts(audience_id, is_subscribed, bounced);
CREATE INDEX IF NOT EXISTS idx_marketing_email_logs_campaign ON marketing_email_logs(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_suppression_email ON marketing_suppression_list(email);
CREATE INDEX IF NOT EXISTS idx_workflow_nodes_order ON workflow_nodes(workflow_id, step_order);
