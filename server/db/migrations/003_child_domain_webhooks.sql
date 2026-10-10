-- =========================================================================
-- MIGRATION 003: TABLA DE TELEMETRÍA Y SUBDOMINIOS HIJOS DEL WEBHOOK MASTER
-- =========================================================================

CREATE TABLE IF NOT EXISTS master_webhook_telemetry_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_domain VARCHAR(120) NOT NULL,
  subdomain_key VARCHAR(50) NOT NULL,
  routing_key VARCHAR(80),
  event_type VARCHAR(100) NOT NULL,
  workspace_id UUID,
  project_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) DEFAULT 'PROCESSED',
  latency_ms INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhook_source_domain ON master_webhook_telemetry_logs(source_domain);
CREATE INDEX IF NOT EXISTS idx_webhook_subdomain_key ON master_webhook_telemetry_logs(subdomain_key);
CREATE INDEX IF NOT EXISTS idx_webhook_event_type ON master_webhook_telemetry_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_created_at ON master_webhook_telemetry_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS child_webhook_subdomains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain VARCHAR(120) UNIQUE NOT NULL,
  subdomain_key VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(150) NOT NULL,
  purpose VARCHAR(255) NOT NULL,
  endpoint_path VARCHAR(200) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO child_webhook_subdomains (domain, subdomain_key, display_name, purpose, endpoint_path)
VALUES 
  ('vc.tsolutionsipidd.com', 'vc', 'TSolutions Virtual Classroom & Videoconferencias', 'Salas WebRTC, telemetria de reuniones, minutas y transcripciones', '/api/v1/webhooks/child/vc'),
  ('tsolutionsipidd.com', 'main_tsolutions', 'TSolutions IPIDD Dominio Corporativo Principal', 'Captura de leads, contratos digitales, suscripcion enterprise', '/api/v1/webhooks/child/main'),
  ('admin.lacuevadelguero.com', 'admin_lacueva', 'La Cueva del Guero Panel de Administracion & POS', 'Alertas de inventario, cortes de caja POS, alertas operativas', '/api/v1/webhooks/child/lacueva-admin'),
  ('s.tsolutionsipidd.com', 's_tsolutions', 'TSolutions Storage, Assets & API Services', 'Eventos de carga en storage, cache CDN, health checks de microservicios', '/api/v1/webhooks/child/s-tsolutions'),
  ('m.tsolutionsipidd.com', 'm_tsolutions', 'TSolutions PWA Movil & Mesa de Trabajo', 'Acciones moviles, sincronizacion offline, telemetria PWA', '/api/v1/webhooks/child/m-tsolutions'),
  ('lacuevadelguero.com', 'main_lacueva', 'La Cueva del Guero Portal Comercial Principal', 'Pedidos de restaurante, reservaciones de mesas, catalogo comercial', '/api/v1/webhooks/child/lacueva'),
  ('s.lacuevadelguero.com', 's_lacueva', 'La Cueva del Guero Sucursales & Delivery', 'Despacho de sucursales, choferes de delivery, webhooks de pagos', '/api/v1/webhooks/child/lacueva-s')
ON CONFLICT (domain) DO UPDATE 
SET display_name = EXCLUDED.display_name,
    purpose = EXCLUDED.purpose,
    endpoint_path = EXCLUDED.endpoint_path;
