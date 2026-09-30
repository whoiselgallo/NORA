-- ============================================================================
-- MIGRACIÓN 002: NEXUS ARCHITECT STUDIO - ONBOARDING, CONTRATOS & WEBHOOKS
-- TSolutions IPIDD • Arquitectura Multi-Tenant & Catálogo de Arquetipos
-- ============================================================================

-- 1. Catálogo Oficial de Servicios por Dominio
CREATE TABLE IF NOT EXISTS system_service_catalog (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain VARCHAR(100) NOT NULL, -- vc.tsolutionsipidd.com | identidad.tsolutionsipidd.com | www.tsolutionsipidd.com
    archetype VARCHAR(50) NOT NULL, -- BIOLINK | LANDING_PAGE | DIGITAL_MENU | BRAND_IDENTITY | CORPORATE_WEB | WEB_WITH_API | ECOMMERCE | SAAS_WEBAPP | OPEX_MANAGEMENT
    package_name VARCHAR(150) NOT NULL,
    package_code VARCHAR(100) UNIQUE NOT NULL,
    price_amount NUMERIC(12,2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'MXN',
    billing_scheme VARCHAR(50) NOT NULL DEFAULT 'ONE_TIME', -- ONE_TIME | ANNUAL | MONTHLY_MAINTENANCE | PER_USER
    maintenance_fee NUMERIC(12,2) DEFAULT 0.00,
    description TEXT NOT NULL,
    contract_template_type VARCHAR(100) NOT NULL,
    estimated_delivery_days INTEGER NOT NULL DEFAULT 14,
    tech_stack_preset JSONB NOT NULL DEFAULT '{}'::jsonb,
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Entregables Corporativos y Contratos Compilados con Marca Oficial
CREATE TABLE IF NOT EXISTS corporate_deliverables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    deliverable_type VARCHAR(100) NOT NULL, -- CONTRACT_MASTER | CONTRACT_VCARD_LICENSE | CONTRACT_BRAND_ASSIGNMENT | EXECUTIVE_CLOSURE
    title VARCHAR(255) NOT NULL,
    content_html TEXT NOT NULL,
    content_markdown TEXT,
    pdf_storage_url TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Configuración Criptográfica de Webhooks CI/CD por Proyecto
CREATE TABLE IF NOT EXISTS project_webhook_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
    provider VARCHAR(50) NOT NULL DEFAULT 'github', -- github | gitlab
    routing_key VARCHAR(100) UNIQUE NOT NULL,
    secret_token VARCHAR(255) NOT NULL,
    webhook_url TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Habilitar Row-Level Security (RLS) Multi-Tenant
ALTER TABLE system_service_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_catalog_public_read ON system_service_catalog;
CREATE POLICY service_catalog_public_read ON system_service_catalog
    FOR SELECT USING (true);

ALTER TABLE corporate_deliverables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS corporate_deliverables_workspace_policy ON corporate_deliverables;
CREATE POLICY corporate_deliverables_workspace_policy ON corporate_deliverables
    FOR ALL
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id = get_current_workspace_id()
    )
    WITH CHECK (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id = get_current_workspace_id()
    );

ALTER TABLE project_webhook_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_webhook_configs_workspace_policy ON project_webhook_configs;
CREATE POLICY project_webhook_configs_workspace_policy ON project_webhook_configs
    FOR ALL
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id = get_current_workspace_id()
    )
    WITH CHECK (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id = get_current_workspace_id()
    );

-- Índices de alto rendimiento
CREATE INDEX IF NOT EXISTS idx_service_catalog_domain ON system_service_catalog(domain, archetype);
CREATE INDEX IF NOT EXISTS idx_corp_deliverables_ws_proj ON corporate_deliverables(workspace_id, project_id);
CREATE INDEX IF NOT EXISTS idx_webhook_configs_routing ON project_webhook_configs(routing_key);
CREATE INDEX IF NOT EXISTS idx_webhook_configs_ws_proj ON project_webhook_configs(workspace_id, project_id);

-- ============================================================================
-- 5. POBLACIÓN DEL CATÁLOGO OFICIAL DE SERVICIOS TSOLUTIONS IPIDD
-- ============================================================================

INSERT INTO system_service_catalog (
    domain, archetype, package_name, package_code, price_amount, currency, billing_scheme, maintenance_fee,
    description, contract_template_type, estimated_delivery_days, tech_stack_preset, features
) VALUES
-- Dominio 1: vc.tsolutionsipidd.com (Rose vCard Engine)
(
    'vc.tsolutionsipidd.com',
    'BIOLINK',
    'vCard Starter Digital',
    'VCARD_STARTER',
    1200.00,
    'MXN',
    'ANNUAL',
    0.00,
    'Tarjeta digital interactiva, botón de guardado en contactos (.vcf), enlaces a redes y QR dinámico.',
    'CONTRACT_VCARD_LICENSE',
    3,
    '{"technologies": ["HTML5", "CSS3 Tokens", "Vanilla JS", "Neon PostgreSQL"], "hosting": "Vercel Edge / Cloudflare"}',
    '["Perfil vCard responsivo", "Descarga de contacto .vcf", "Código QR vectorial descargable", "Enlaces directos a WhatsApp/Redes", "SLA 99.5% disponibilidad"]'
),
(
    'vc.tsolutionsipidd.com',
    'BIOLINK',
    'vCard Business Pro NFC',
    'VCARD_BUSINESS_PRO',
    2500.00,
    'MXN',
    'ANNUAL',
    600.00,
    'Tarjeta física en PVC o metal con chip NTAG216 + perfil digital dinámico en subdominio + panel de edición de métricas.',
    'CONTRACT_VCARD_LICENSE',
    5,
    '{"technologies": ["HTML5", "CSS3 Tokens", "Vanilla JS", "NFC NTAG216", "Neon DB"], "hosting": "Vercel Edge"}',
    '["Tarjeta física PVC/Metal con chip NFC", "Subdominio personalizado en vc.", "Panel de telemetría de toques", "Mantenimiento y soporte anual", "Garantía de chip 1 año"]'
),
(
    'vc.tsolutionsipidd.com',
    'BIOLINK',
    'vCard Enterprise Fleet',
    'VCARD_ENTERPRISE_FLEET',
    1500.00,
    'MXN',
    'PER_USER',
    0.00,
    'Desde 10 perfiles corporativos con gestión centralizada y Google Cloud SQL backend.',
    'CONTRACT_VCARD_LICENSE',
    10,
    '{"technologies": ["React", "Express", "Google Cloud SQL", "NFC NTAG216"], "hosting": "Cloud Run"}',
    '["Gestión centralizada de flota", "Directorio corporativo unificado", "Roles y permisos jerárquicos", "Plantilla de marca estandarizada", "SLA 99.9% disponibilidad"]'
),

-- Dominio 2: identidad.tsolutionsipidd.com (Diseño, Branding & Tokens)
(
    'identidad.tsolutionsipidd.com',
    'BRAND_IDENTITY',
    'Identidad Digital Base',
    'BRAND_BASE',
    6500.00,
    'MXN',
    'ONE_TIME',
    0.00,
    'Isotipo vectorial, logotipo principal y secundario, paleta cromática (Tokens CSS/HEX), tipografías institucionales y manual básico en PDF.',
    'CONTRACT_BRAND_ASSIGNMENT',
    7,
    '{"technologies": ["Figma", "Adobe Illustrator", "Design Tokens JSON"], "hosting": "Repositorio de Marca / CDN"}',
    '["Isotipo vectorial geométrico", "Logotipo principal y secundario", "Tokens de color CSS/HEX", "Tipografías corporativas", "Manual de identidad en PDF"]'
),
(
    'identidad.tsolutionsipidd.com',
    'BRAND_IDENTITY',
    'Manual de Identidad & Design System Pro',
    'BRAND_PRO',
    14000.00,
    'MXN',
    'ONE_TIME',
    0.00,
    'Todo lo anterior más iconografía personalizada, componentes UI para web, mockups 3D y especificaciones de marca para webapps.',
    'CONTRACT_BRAND_ASSIGNMENT',
    14,
    '{"technologies": ["Figma", "Adobe Suite", "Design Tokens JSON", "Tailwind Theme"], "hosting": "Repositorio CDN"}',
    '["Design System completo en Figma", "Iconografía vectorial SVG", "Componentes UI para Tailwind", "Mockups 3D de producto", "Cesión total de derechos patrimoniales"]'
),
(
    'identidad.tsolutionsipidd.com',
    'BRAND_IDENTITY',
    'Rebranding & Transformación Integral',
    'BRAND_INTEGRAL',
    24000.00,
    'MXN',
    'ONE_TIME',
    0.00,
    'Arquitectura de marca completa, activos vectoriales para producción (Cricut/plotter), material comercial y lineamientos de voz/tono para IA.',
    'CONTRACT_BRAND_ASSIGNMENT',
    21,
    '{"technologies": ["Figma", "Design Tokens", "Vector SVG/DXF", "AI Prompt Guidelines"], "hosting": "Repositorio de Marca"}',
    '["Arquitectura de marca corporativa", "Archivos listos para plotter y rotulación", "Lineamientos de voz y tono para IA", "Papelería comercial completa", "Soporte de diseño prioritario"]'
),

-- Dominio 3: www.tsolutionsipidd.com (Desarrollo Web, SaaS y Consultoría OPEX)
(
    'www.tsolutionsipidd.com',
    'LANDING_PAGE',
    'Landing Page de Alta Conversión',
    'LANDING_HIGH_CONVERSION',
    7500.00,
    'MXN',
    'ONE_TIME',
    0.00,
    'Arquitectura de una sola página, microinteracciones, formulario conectado a base de datos y píxel de telemetría.',
    'CONTRACT_MASTER',
    7,
    '{"technologies": ["Next.js", "Astro", "Tailwind CSS", "BullMQ"], "hosting": "Vercel CDN"}',
    '["Diseño ultra optimizado para conversión móvil", "Integración de formularios a CRM", "Píxel de telemetría y eventos", "Core Web Vitals >= 90", "Garantía de 60 días"]'
),
(
    'www.tsolutionsipidd.com',
    'CORPORATE_WEB',
    'Página Web Corporativa / Catálogo',
    'WEB_CORPORATE',
    12500.00,
    'MXN',
    'ONE_TIME',
    0.00,
    'Hasta 5 secciones dinámicas, optimización SEO técnica y formulario transaccional.',
    'CONTRACT_MASTER',
    14,
    '{"technologies": ["Next.js", "Tailwind CSS", "Headless CMS", "Markdown"], "hosting": "Vercel"}',
    '["Hasta 5 secciones dinámicas", "SEO técnico on-page optimizado", "Formulario transaccional seguro", "Integración con Google Analytics", "Certificado SSL incluido"]'
),
(
    'www.tsolutionsipidd.com',
    'DIGITAL_MENU',
    'Menú Digital Dinámico para Restauración',
    'DIGITAL_MENU_RESTAURANT',
    9800.00,
    'MXN',
    'MONTHLY_MAINTENANCE',
    450.00,
    'Panel administrativo para actualización de platillos/precios en vivo, código QR vectorizado y filtros de alérgenos.',
    'CONTRACT_MASTER',
    10,
    '{"technologies": ["React", "Node.js", "PostgreSQL", "Socket.io"], "hosting": "Google Cloud Run + Vercel"}',
    '["Panel administrativo en tiempo real", "Código QR vectorial para mesas", "Filtros de alérgenos y categorías", "Actualización instantánea sin reimpresión", "Soporte mensual continuo"]'
),
(
    'www.tsolutionsipidd.com',
    'WEB_WITH_API',
    'Sitio Web con API / Plataforma Transaccional',
    'WEB_WITH_API',
    22000.00,
    'MXN',
    'ONE_TIME',
    0.00,
    'Backend dedicado con Express y PostgreSQL, autenticación de usuarios, roles y panel administrativo.',
    'CONTRACT_MASTER',
    21,
    '{"technologies": ["React", "Express", "Neon PostgreSQL", "JWT Auth"], "hosting": "Cloud Run + Neon DB"}',
    '["Backend REST modular con TypeScript", "Autenticación segura JWT y roles", "Panel de administración SPA", "Base de datos Neon PostgreSQL con RLS", "Documentación Swagger/OpenAPI"]'
),
(
    'www.tsolutionsipidd.com',
    'ECOMMERCE',
    'E-commerce Completo & Pagos Seguros',
    'ECOMMERCE_FULL',
    32000.00,
    'MXN',
    'ONE_TIME',
    0.00,
    'Catálogo ilimitado, cálculo automático de envíos, pasarela de pago segura (Stripe/Clip), panel de pedidos y alertas al Webhook Master.',
    'CONTRACT_MASTER',
    28,
    '{"technologies": ["Next.js", "Node.js", "PostgreSQL", "Stripe", "Clip"], "hosting": "Cloud Run + Redis + Neon"}',
    '["Catálogo ilimitado de productos", "Pasarela de pagos Stripe y Clip integrada", "Panel de administración de órdenes", "Alertas automáticas vía Webhook Master", "Cálculo dinámico de envíos"]'
),
(
    'www.tsolutionsipidd.com',
    'SAAS_WEBAPP',
    'Aplicación Web SaaS Full-Stack',
    'SAAS_FULLSTACK',
    38000.00,
    'MXN',
    'ONE_TIME',
    0.00,
    'Plataforma SaaS con autenticación multi-tenant, procesamiento asíncrono con BullMQ, PostgreSQL y panel reactivo.',
    'CONTRACT_MASTER',
    35,
    '{"technologies": ["React", "Express", "Redis", "BullMQ", "Neon Auth"], "hosting": "Cloud Run + Vercel + Neon"}',
    '["Arquitectura multi-tenant estricta", "Colas asíncronas BullMQ con reintentos", "Autenticación y roles granulares", "Paneles analíticos en tiempo real", "SLA 99.9% empresarial"]'
),
(
    'www.tsolutionsipidd.com',
    'OPEX_MANAGEMENT',
    'Herramienta de Gestión OPEX / Sistema a la Medida',
    'OPEX_SYSTEM',
    45000.00,
    'MXN',
    'ONE_TIME',
    0.00,
    'Plataforma SaaS con paneles DMAIC, telemetría en vivo, gestión de calidad (Pareto/Ishikawa), memoria vectorial Nexus y usuarios concurrentes.',
    'CONTRACT_MASTER',
    42,
    '{"technologies": ["React", "Node.js", "pgvector", "Webhooks Master", "Socket.io"], "hosting": "Container Cluster + Redis"}',
    '["Módulo Six Sigma DMAIC con tollgates", "Diagramas interactivos Ishikawa 6M y Pareto", "Conexión directa al Cerebro Nexus (pgvector)", "Webhook Master para telemetría CI/CD", "Auditoría de calidad y reportes ejecutivos"]'
)
ON CONFLICT (package_code) DO UPDATE SET
    price_amount = EXCLUDED.price_amount,
    description = EXCLUDED.description,
    features = EXCLUDED.features,
    tech_stack_preset = EXCLUDED.tech_stack_preset;
