-- MIGRACIÓN: CIERRE DE PROYECTOS, ARCHIVADO INMUTABLE & CEREBRO VECTORIAL NEXUS (PGVECTOR)
-- TSOLUTIONS IPIDD - NEON POSTGRESQL ARCHITECTURE

-- 1. Habilitar extensión pgvector
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Modificar tabla projects para incluir ciclo de vida formal y estado ARCHIVED
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE';
DO $$ BEGIN
    ALTER TABLE projects ADD CONSTRAINT chk_project_status CHECK (status IN ('ACTIVE', 'IN_PROGRESS', 'ARCHIVED'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. Tabla project_closures: Registro de Cierre Formal y Acta Ejecutiva
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

-- 4. Tabla project_snapshots: Captura integral inmutable en JSONB
CREATE TABLE IF NOT EXISTS project_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
    snapshot_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabla nexus_knowledge_vectors: Memoria continua asistida por pgvector
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
            'SOP_PROCEDURES'
        )
    ),
    title VARCHAR(200) NOT NULL,
    raw_content TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    embedding vector(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Índices HNSW y B-Tree optimizados para consultas en <100ms
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

-- 7. Configuración de Row-Level Security (RLS) Multi-Tenant
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

-- 8. TRIGGER DE BLOQUEO DE MUTACIONES EN PROYECTOS ARCHIVADOS (MODO SOLO LECTURA INMUTABLE)
CREATE OR REPLACE FUNCTION prevent_mutation_on_archived_project()
RETURNS TRIGGER AS $$
DECLARE
    target_project_id UUID;
    proj_status VARCHAR(50);
BEGIN
    IF TG_TABLE_NAME = 'projects' THEN
        target_project_id := OLD.id;
    ELSIF TG_TABLE_NAME IN ('project_tasks', 'opex_five_whys', 'opex_ishikawa_diagrams', 'opex_swot_items', 'opex_pareto_data', 'dmaic_phases') THEN
        target_project_id := COALESCE(NEW.project_id, OLD.project_id);
    ELSIF TG_TABLE_NAME = 'workflow_nodes' THEN
        SELECT project_id INTO target_project_id FROM project_workflows WHERE id = COALESCE(NEW.workflow_id, OLD.workflow_id);
    ELSIF TG_TABLE_NAME = 'workflow_edges' THEN
        SELECT project_id INTO target_project_id FROM project_workflows WHERE id = COALESCE(NEW.workflow_id, OLD.workflow_id);
    ELSIF TG_TABLE_NAME = 'opex_ishikawa_factors' THEN
        SELECT oid.project_id INTO target_project_id 
        FROM opex_ishikawa_diagrams oid 
        WHERE oid.id = COALESCE(NEW.diagram_id, OLD.diagram_id);
    END IF;

    IF target_project_id IS NOT NULL THEN
        SELECT status INTO proj_status FROM projects WHERE id = target_project_id;
        IF proj_status = 'ARCHIVED' THEN
            RAISE EXCEPTION 'PROJECT_IS_ARCHIVED_READ_ONLY: El proyecto % se encuentra formalmente ARCHIVADO. Todas las mutaciones sobre sus tareas, DAG, metodologías OPEX y fases están bloqueadas de forma inmutable.', target_project_id
            USING ERRCODE = '55000';
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Asignar triggers de inmutabilidad a tablas dependientes
DROP TRIGGER IF EXISTS trg_prevent_mutation_tasks ON project_tasks;
CREATE TRIGGER trg_prevent_mutation_tasks
BEFORE INSERT OR UPDATE OR DELETE ON project_tasks
FOR EACH ROW EXECUTE FUNCTION prevent_mutation_on_archived_project();

DROP TRIGGER IF EXISTS trg_prevent_mutation_workflow_nodes ON workflow_nodes;
CREATE TRIGGER trg_prevent_mutation_workflow_nodes
BEFORE INSERT OR UPDATE OR DELETE ON workflow_nodes
FOR EACH ROW EXECUTE FUNCTION prevent_mutation_on_archived_project();

DROP TRIGGER IF EXISTS trg_prevent_mutation_workflow_edges ON workflow_edges;
CREATE TRIGGER trg_prevent_mutation_workflow_edges
BEFORE INSERT OR UPDATE OR DELETE ON workflow_edges
FOR EACH ROW EXECUTE FUNCTION prevent_mutation_on_archived_project();

DROP TRIGGER IF EXISTS trg_prevent_mutation_five_whys ON opex_five_whys;
CREATE TRIGGER trg_prevent_mutation_five_whys
BEFORE INSERT OR UPDATE OR DELETE ON opex_five_whys
FOR EACH ROW EXECUTE FUNCTION prevent_mutation_on_archived_project();

DROP TRIGGER IF EXISTS trg_prevent_mutation_ishikawa_diagrams ON opex_ishikawa_diagrams;
CREATE TRIGGER trg_prevent_mutation_ishikawa_diagrams
BEFORE INSERT OR UPDATE OR DELETE ON opex_ishikawa_diagrams
FOR EACH ROW EXECUTE FUNCTION prevent_mutation_on_archived_project();

DROP TRIGGER IF EXISTS trg_prevent_mutation_ishikawa_factors ON opex_ishikawa_factors;
CREATE TRIGGER trg_prevent_mutation_ishikawa_factors
BEFORE INSERT OR UPDATE OR DELETE ON opex_ishikawa_factors
FOR EACH ROW EXECUTE FUNCTION prevent_mutation_on_archived_project();

DROP TRIGGER IF EXISTS trg_prevent_mutation_swot_items ON opex_swot_items;
CREATE TRIGGER trg_prevent_mutation_swot_items
BEFORE INSERT OR UPDATE OR DELETE ON opex_swot_items
FOR EACH ROW EXECUTE FUNCTION prevent_mutation_on_archived_project();

DROP TRIGGER IF EXISTS trg_prevent_mutation_pareto_data ON opex_pareto_data;
CREATE TRIGGER trg_prevent_mutation_pareto_data
BEFORE INSERT OR UPDATE OR DELETE ON opex_pareto_data
FOR EACH ROW EXECUTE FUNCTION prevent_mutation_on_archived_project();

DROP TRIGGER IF EXISTS trg_prevent_mutation_dmaic_phases ON dmaic_phases;
CREATE TRIGGER trg_prevent_mutation_dmaic_phases
BEFORE INSERT OR UPDATE OR DELETE ON dmaic_phases
FOR EACH ROW EXECUTE FUNCTION prevent_mutation_on_archived_project();
