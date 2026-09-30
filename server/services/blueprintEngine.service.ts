import { PoolClient } from 'pg';

export type ProjectArchetype = 
  | 'BIOLINK' 
  | 'LANDING_PAGE' 
  | 'DIGITAL_MENU' 
  | 'BRAND_IDENTITY' 
  | 'CORPORATE_WEB' 
  | 'WEB_WITH_API' 
  | 'ECOMMERCE' 
  | 'SAAS_WEBAPP' 
  | 'OPEX_MANAGEMENT';

export interface BlueprintNodeDef {
  title: string;
  category: 'infra' | 'backend' | 'frontend' | 'devops' | 'qa' | 'marketing';
  is_automated_github: boolean;
  github_trigger_event?: string;
  position_x: number;
  position_y: number;
  default_tasks: Array<{ title: string; description: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' }>;
}

export class BlueprintEngineService {
  /**
   * Topologías especializadas de grafos DAG según el arquetipo de proyecto
   */
  public static ARCHETYPE_SEQUENCES: Record<ProjectArchetype, BlueprintNodeDef[]> = {
    // 1. BIOLINK (Rose vCard Engine - vc.tsolutionsipidd.com)
    BIOLINK: [
      {
        title: 'Arquitectura CSS Mobile-First & Tokens',
        category: 'frontend',
        is_automated_github: false,
        position_x: 80,
        position_y: 220,
        default_tasks: [
          { title: 'Estructurar micro-layout mobile-first con variables CSS y tokens', description: 'Garantizar diseño ultra-ligero y renderizado en menos de 300ms.', priority: 'HIGH' },
          { title: 'Diseño de enlaces rápidos y botones de contacto', description: 'Botones para WhatsApp, llamadas, correo y redes con microinteracciones.', priority: 'MEDIUM' }
        ]
      },
      {
        title: 'Integración VCF & Contact Engine',
        category: 'backend',
        is_automated_github: false,
        position_x: 380,
        position_y: 220,
        default_tasks: [
          { title: 'Generador dinámico de archivo vCard RFC 6350 (.vcf)', description: 'Codificación UTF-8 con campos de foto, organización, cargo y notas.', priority: 'CRITICAL' },
          { title: 'Endpoint de descarga e importación directa a agenda', description: 'Compatibilidad con iOS Contacts y Google Contacts sin fricción.', priority: 'HIGH' }
        ]
      },
      {
        title: 'Generador QR Dinámico & Payload NFC',
        category: 'infra',
        is_automated_github: false,
        position_x: 680,
        position_y: 220,
        default_tasks: [
          { title: 'Generación de código QR vectorial en SVG para impresión', description: 'Exportación con calidad de 300 DPI y logotipo central incrustado.', priority: 'MEDIUM' },
          { title: 'Configuración de NDEF records para chips NFC NTAG216', description: 'Grabación de URL canónica de subdominio en tarjetas físicas.', priority: 'HIGH' }
        ]
      },
      {
        title: 'Despliegue Edge & CDN Vercel',
        category: 'devops',
        is_automated_github: true,
        github_trigger_event: 'workflow_run',
        position_x: 980,
        position_y: 220,
        default_tasks: [
          { title: 'Despliegue en Vercel Edge con caching global', description: 'Tiempo de respuesta global inferior a 150ms bajo CDN.', priority: 'HIGH' },
          { title: 'Configuración de subdominio personalizado en vc.', description: 'Asignación de DNS y verificación de certificado SSL TLS 1.3.', priority: 'HIGH' }
        ]
      }
    ],

    // 2. BRAND_IDENTITY (identidad.tsolutionsipidd.com)
    BRAND_IDENTITY: [
      {
        title: 'Moodboard & Briefing de Marca',
        category: 'marketing',
        is_automated_github: false,
        position_x: 80,
        position_y: 220,
        default_tasks: [
          { title: 'Entrevista de arquetipos de marca y posicionamiento', description: 'Levantamiento de atributos, valores diferenciales y target demográfico.', priority: 'HIGH' },
          { title: 'Curaduría visual y tablero de referencias en Figma', description: 'Selección de estilo, texturas, iluminación y contrastes.', priority: 'MEDIUM' }
        ]
      },
      {
        title: 'Geometría Vectorial de Isotipo',
        category: 'frontend',
        is_automated_github: false,
        position_x: 380,
        position_y: 220,
        default_tasks: [
          { title: 'Construcción geométrica sobre grilla áurea y base hexagonal', description: 'Trazado milimétrico con curvas Bézier y equilibrio simétrico.', priority: 'CRITICAL' },
          { title: 'Pruebas de legibilidad en escala mínima (16x16 px)', description: 'Validación de contraste y rendimiento como favicon e icono de app.', priority: 'HIGH' }
        ]
      },
      {
        title: 'Generación de Tokens JSON & Tipografía',
        category: 'frontend',
        is_automated_github: false,
        position_x: 680,
        position_y: 220,
        default_tasks: [
          { title: 'Exportación de Design Tokens en JSON (Colores HEX, CSS Vars)', description: 'Tokens normalizados para Naranja Energy, Aqua Turquesa y Midnight Panel.', priority: 'HIGH' },
          { title: 'Definición de jerarquía tipográfica (Bruno Ace & Space Grotesk)', description: 'Especificación de pesos, line-heights y compatibilidad web font.', priority: 'HIGH' }
        ]
      },
      {
        title: 'Maquetación de Manual de Identidad Pro',
        category: 'marketing',
        is_automated_github: false,
        position_x: 980,
        position_y: 220,
        default_tasks: [
          { title: 'Compilación de normas de uso, zonas de seguridad y fondos', description: 'Documento normativo de gobernanza de marca y usos prohibidos.', priority: 'HIGH' },
          { title: 'Generación de PDF formal con BrandEnforcerService', description: 'Presentación ejecutiva 16:9 con tokens oficiales de TSolutions IPIDD.', priority: 'MEDIUM' }
        ]
      },
      {
        title: 'Exportación de Activos SVG & Plotter',
        category: 'devops',
        is_automated_github: false,
        position_x: 1280,
        position_y: 220,
        default_tasks: [
          { title: 'Exportación de archivos vectoriales para Cricut y rotulación', description: 'Formatos SVG, AI, EPS y DXF listos para corte en plotter.', priority: 'HIGH' },
          { title: 'Carga de activos al repositorio central de marca y CDN', description: 'Distribución segura con enlaces permanentes para el cliente.', priority: 'HIGH' }
        ]
      }
    ],

    // 3. DIGITAL_MENU (Menú Digital para Restauración)
    DIGITAL_MENU: [
      {
        title: 'Estructura de Platillos & Alérgenos',
        category: 'backend',
        is_automated_github: false,
        position_x: 80,
        position_y: 220,
        default_tasks: [
          { title: 'Modelado relacional de platillos, precios y categorías', description: 'Esquema de base de datos con soporte para extras, tallas y variantes.', priority: 'HIGH' },
          { title: 'Filtro semántico de alérgenos y opciones vegetarianas/veganas', description: 'Etiquetas visuales de ingredientes sensibles conforme a normativa.', priority: 'MEDIUM' }
        ]
      },
      {
        title: 'Panel Administrativo en Tiempo Real',
        category: 'frontend',
        is_automated_github: false,
        position_x: 380,
        position_y: 220,
        default_tasks: [
          { title: 'UI reactiva para edición instantánea de precios y disponibilidad', description: 'Interruptor de platillo agotado con reflejo instantáneo en clientes.', priority: 'HIGH' },
          { title: 'Sincronización bidireccional mediante WebSockets Socket.io', description: 'Emisión de eventos MENU_UPDATED a todas las mesas conectadas.', priority: 'HIGH' }
        ]
      },
      {
        title: 'Generación de QR Vectorial Dinámico',
        category: 'infra',
        is_automated_github: false,
        position_x: 680,
        position_y: 220,
        default_tasks: [
          { title: 'Generación de códigos QR únicos por mesa / sucursal', description: 'Rutas parametrizadas (?table=12) con trazabilidad de visitas.', priority: 'MEDIUM' },
          { title: 'Optimización de carga instantánea sin login ni descarga de app', description: 'PWA con caché estática para apertura en menos de 1 segundo.', priority: 'HIGH' }
        ]
      },
      {
        title: 'Despliegue Web & Cloud Run',
        category: 'devops',
        is_automated_github: true,
        github_trigger_event: 'workflow_run',
        position_x: 980,
        position_y: 220,
        default_tasks: [
          { title: 'Pipeline de CI/CD hacia Google Cloud Run y Vercel', description: 'Despliegue automático ante push en rama main con pruebas superadas.', priority: 'HIGH' },
          { title: 'Verificación de Core Web Vitals en conexiones móviles 4G/3G', description: 'Lighthouse score >= 90 en performance para comensales en el local.', priority: 'HIGH' }
        ]
      }
    ],

    // 4. LANDING_PAGE (Landing de Alta Conversión)
    LANDING_PAGE: [
      {
        title: 'Wireframing & Conversión UX',
        category: 'frontend',
        is_automated_github: false,
        position_x: 80,
        position_y: 220,
        default_tasks: [
          { title: 'Estructura de una sola página enfocada en conversión directa', description: 'Jerarquía visual de Hero, Beneficios, Prueba Social, Precios y FAQ.', priority: 'HIGH' },
          { title: 'Diseño de llamadas a la acción (CTA) con alto contraste', description: 'Botones fijados en viewport móvil con tracking de clics.', priority: 'HIGH' }
        ]
      },
      {
        title: 'Next.js & Tailwind Components',
        category: 'frontend',
        is_automated_github: false,
        position_x: 380,
        position_y: 220,
        default_tasks: [
          { title: 'Maquetación de componentes atómicos con Tailwind CSS', description: 'Renderizado Server-Side híbrido para SEO y velocidad.', priority: 'HIGH' },
          { title: 'Microinteracciones fluidas y animaciones con Framer Motion', description: 'Transiciones suaves de entrada y efectos visuales de marca.', priority: 'MEDIUM' }
        ]
      },
      {
        title: 'Lead Pipeline & BullMQ Worker',
        category: 'backend',
        is_automated_github: false,
        position_x: 680,
        position_y: 220,
        default_tasks: [
          { title: 'Formulario de contacto con captura de leads y validación Zod', description: 'Validación estricta de teléfono, email corporativo y sanitización.', priority: 'CRITICAL' },
          { title: 'Worker BullMQ para despacho asíncrono y webhook a CRM', description: 'Enrutamiento inmediato de prospectos con reintentos automáticos.', priority: 'HIGH' }
        ]
      },
      {
        title: 'Píxel de Telemetría & Despliegue Vercel',
        category: 'devops',
        is_automated_github: true,
        github_trigger_event: 'workflow_run',
        position_x: 980,
        position_y: 220,
        default_tasks: [
          { title: 'Integración de eventos de analítica y pixel de conversión', description: 'Monitoreo de scroll, tiempo en página y clics en botones clave.', priority: 'MEDIUM' },
          { title: 'Despliegue en Vercel Edge con Core Web Vitals >= 90', description: 'Compresión Brotli, optimización de fuentes y caché inmutable.', priority: 'HIGH' }
        ]
      }
    ],

    // 5. CORPORATE_WEB (Página Web Corporativa)
    CORPORATE_WEB: [
      {
        title: 'Estructura de 5 Secciones & SEO Técnico',
        category: 'frontend',
        is_automated_github: false,
        position_x: 80,
        position_y: 220,
        default_tasks: [
          { title: 'Maquetación de Home, Servicios, Nosotros, Portafolio y Contacto', description: 'Arquitectura de información corporativa y navegación intuitiva.', priority: 'HIGH' },
          { title: 'Metadatos OpenGraph, Schema.org y sitemap.xml para SEO', description: 'Indexación óptima en Google con Rich Snippets corporativos.', priority: 'HIGH' }
        ]
      },
      {
        title: 'Headless CMS & Markdown Engine',
        category: 'backend',
        is_automated_github: false,
        position_x: 380,
        position_y: 220,
        default_tasks: [
          { title: 'Integración de repositorio Markdown / CMS headless para contenidos', description: 'Gestión ágil de casos de éxito y entradas de blog sin tocar código.', priority: 'MEDIUM' },
          { title: 'Renderizado estático optimizado con revalidación incremental (ISR)', description: 'Actualización en vivo sin recompilaciones completas del sitio.', priority: 'HIGH' }
        ]
      },
      {
        title: 'Formulario Transaccional & Anti-Spam',
        category: 'backend',
        is_automated_github: false,
        position_x: 680,
        position_y: 220,
        default_tasks: [
          { title: 'Endpoint de cotización con protección Cloudflare Turnstile', description: 'Bloqueo del 100% de envíos automatizados de spam y bots.', priority: 'HIGH' },
          { title: 'Notificaciones automáticas a correo corporativo vía SMTP seguro', description: 'Plantilla de correo con branding de TSolutions y datos estructurados.', priority: 'MEDIUM' }
        ]
      },
      {
        title: 'Optimización de Rendimiento & Despliegue',
        category: 'devops',
        is_automated_github: true,
        github_trigger_event: 'workflow_run',
        position_x: 980,
        position_y: 220,
        default_tasks: [
          { title: 'Auditoría Lighthouse con Performance y Accesibilidad >= 90', description: 'Aseguramiento de contraste WCAG AA y tiempos de carga bajos.', priority: 'HIGH' },
          { title: 'Despliegue en producción con certificado SSL automático', description: 'Configuración de dominio propio con soporte CDN multicontinente.', priority: 'HIGH' }
        ]
      }
    ],

    // 6. WEB_WITH_API (Sitio Web con API / Plataforma Transaccional)
    WEB_WITH_API: [
      {
        title: 'Arquitectura REST & Neon PostgreSQL',
        category: 'infra',
        is_automated_github: false,
        position_x: 80,
        position_y: 220,
        default_tasks: [
          { title: 'Definición de tablas, índices y migraciones en PostgreSQL', description: 'Esquema relacional normalizado con integridad referencial estricta.', priority: 'HIGH' },
          { title: 'Pool de conexiones optimizado con Neon Connection Pooling', description: 'Soporte de alta concurrencia sin saturación de descriptores de socket.', priority: 'HIGH' }
        ]
      },
      {
        title: 'Autenticación JWT & Middleware de Roles',
        category: 'backend',
        is_automated_github: false,
        position_x: 380,
        position_y: 220,
        default_tasks: [
          { title: 'Endpoints de autenticación y refresh token con JWT seguro', description: 'Cifrado de cookies HttpOnly con flags SameSite=Strict y Secure.', priority: 'CRITICAL' },
          { title: 'Middleware RBAC para roles ADMIN, COLLABORATOR y CLIENT', description: 'Protección granular de endpoints según privilegios de usuario.', priority: 'HIGH' }
        ]
      },
      {
        title: 'Panel Administrativo SPA',
        category: 'frontend',
        is_automated_github: false,
        position_x: 680,
        position_y: 220,
        default_tasks: [
          { title: 'Vistas protegidas con tablas de datos paginadas y filtrables', description: 'Visualización rápida de registros con paginación en el servidor.', priority: 'HIGH' },
          { title: 'Consumo de API con Axios / TanStack Query y manejo de errores', description: 'Manejo resiliente de estados de carga, reintentos y notificaciones toast.', priority: 'MEDIUM' }
        ]
      },
      {
        title: 'CI/CD Automatizado & Container Cloud Run',
        category: 'devops',
        is_automated_github: true,
        github_trigger_event: 'workflow_run',
        position_x: 980,
        position_y: 220,
        default_tasks: [
          { title: 'Dockerfile multi-etapa y pipeline en GitHub Actions', description: 'Imagen Docker ligera y segura sin secretos expuestos.', priority: 'HIGH' },
          { title: 'Despliegue automatizado de contenedor en Google Cloud Run', description: 'Autoescalado de 0 a N instancias con costo eficiente por demanda.', priority: 'HIGH' }
        ]
      }
    ],

    // 7. ECOMMERCE (E-commerce Completo & Pagos Seguros)
    ECOMMERCE: [
      {
        title: 'Modelado PostgreSQL & RLS Multi-Tenant',
        category: 'infra',
        is_automated_github: false,
        position_x: 80,
        position_y: 220,
        default_tasks: [
          { title: 'Esquema relacional para productos, variantes, carritos y órdenes', description: 'Tablas estructuradas con stock en tiempo real y bloqueo pesimista.', priority: 'HIGH' },
          { title: 'Políticas de Row-Level Security para aislamiento de compras', description: 'Garantía de privacidad estricta entre pedidos de clientes.', priority: 'CRITICAL' }
        ]
      },
      {
        title: 'Catálogo & Carrito Transaccional',
        category: 'frontend',
        is_automated_github: false,
        position_x: 380,
        position_y: 220,
        default_tasks: [
          { title: 'Buscador reactivo con filtros por categoría y atributos', description: 'Búsqueda por texto rápido y facetas de filtrado dinámicas.', priority: 'HIGH' },
          { title: 'Gestión de carrito de compras persistente con sincronización', description: 'Almacenamiento en LocalStorage y backend para usuarios registrados.', priority: 'HIGH' }
        ]
      },
      {
        title: 'Pasarela de Pagos Segura (Stripe & Clip)',
        category: 'backend',
        is_automated_github: false,
        position_x: 680,
        position_y: 220,
        default_tasks: [
          { title: 'Integración de Checkout Session con Stripe y Clip API', description: 'Aceptación de tarjetas de crédito/débito, transferencias y MSI.', priority: 'CRITICAL' },
          { title: 'Endpoint de Webhook para confirmación de pago e idempotencia', description: 'Validación de firma HMAC y protección contra doble cobro.', priority: 'CRITICAL' }
        ]
      },
      {
        title: 'Panel de Pedidos & Notificaciones BullMQ',
        category: 'backend',
        is_automated_github: false,
        position_x: 980,
        position_y: 220,
        default_tasks: [
          { title: 'Gestión de estados de orden (Pendiente, Pagado, Enviado)', description: 'Tablero operativo con actualización de números de guía y paquetería.', priority: 'HIGH' },
          { title: 'Encolado BullMQ para envío de recibos y tracking al cliente', description: 'Despacho automatizado de comprobantes PDF y correos de estado.', priority: 'MEDIUM' }
        ]
      },
      {
        title: 'CI/CD & Despliegue en Cloud Run + Redis',
        category: 'devops',
        is_automated_github: true,
        github_trigger_event: 'workflow_run',
        position_x: 1280,
        position_y: 220,
        default_tasks: [
          { title: 'Configuración de clúster Redis y base de datos de producción', description: 'Persistencia de colas y sesiones en memoria con alta disponibilidad.', priority: 'HIGH' },
          { title: 'Pipeline de pruebas de integración y despliegue continuo', description: 'Validación de flujo de compra extremo a extremo antes del pase a producción.', priority: 'HIGH' }
        ]
      }
    ],

    // 8. SAAS_WEBAPP (Aplicación Web SaaS Full-Stack)
    SAAS_WEBAPP: [
      {
        title: 'Esquema Multi-Tenant con RLS',
        category: 'infra',
        is_automated_github: false,
        position_x: 80,
        position_y: 220,
        default_tasks: [
          { title: 'Modelado relacional con particionado estricto por workspace_id', description: 'Aislamiento total de datos por tenant en Neon PostgreSQL.', priority: 'CRITICAL' },
          { title: 'Políticas de Row-Level Security en todas las tablas del SaaS', description: 'Auditoría automática de workspace activo mediante set_config.', priority: 'CRITICAL' }
        ]
      },
      {
        title: 'Autenticación Neon Auth & RBAC',
        category: 'backend',
        is_automated_github: false,
        position_x: 380,
        position_y: 220,
        default_tasks: [
          { title: 'Configuración de sesiones seguras y control de acceso por roles', description: 'Manejo de membresías en workspace (Owner, Admin, Member, Client).', priority: 'HIGH' },
          { title: 'Protección contra CSRF, rate-limiting y auditoría de accesos', description: 'Middleware centralizado de seguridad en endpoints mutacionales.', priority: 'HIGH' }
        ]
      },
      {
        title: 'Colas Asíncronas BullMQ & Jobs',
        category: 'backend',
        is_automated_github: false,
        position_x: 680,
        position_y: 220,
        default_tasks: [
          { title: 'Configuración de colas de procesamiento con retroceso exponencial', description: 'Worker con concurrencia controlada y reintentos ante fallas temporales.', priority: 'HIGH' },
          { title: 'Desacople de tareas computacionalmente intensivas a workers', description: 'Procesamiento en background sin bloquear peticiones HTTP de la API.', priority: 'HIGH' }
        ]
      },
      {
        title: 'Dashboard React Flow & Componentes UI',
        category: 'frontend',
        is_automated_github: false,
        position_x: 980,
        position_y: 220,
        default_tasks: [
          { title: 'Paneles interactivos en estética Dark Tech con React Flow', description: 'Visualización de flujos y estado operativo en tiempo real.', priority: 'HIGH' },
          { title: 'Widgets de KPIs, tablas analíticas y gráficos en tiempo real', description: 'Componentes atómicos estilizados con tokens de TSolutions IPIDD.', priority: 'MEDIUM' }
        ]
      },
      {
        title: 'Pipeline CI/CD con Tests Unitarios',
        category: 'devops',
        is_automated_github: true,
        github_trigger_event: 'workflow_run',
        position_x: 1280,
        position_y: 220,
        default_tasks: [
          { title: 'Ejecución de pruebas unitarias y de integración en GitHub Actions', description: 'Verificación de tipado estricto (tsc) y suite de integración.', priority: 'HIGH' },
          { title: 'Cierre de bucle de telemetría hacia el Webhook Master', description: 'Transición automática de nodos DAG a GREEN al confirmar despliegue exitoso.', priority: 'CRITICAL' }
        ]
      }
    ],

    // 9. OPEX_MANAGEMENT (Herramienta de Gestión OPEX / DMAIC)
    OPEX_MANAGEMENT: [
      {
        title: 'Mapeo DMAIC & Tollgates de Calidad',
        category: 'backend',
        is_automated_github: false,
        position_x: 80,
        position_y: 220,
        default_tasks: [
          { title: 'Modelado de las 5 fases DMAIC con control estricto de tollgates', description: 'Aprobación formal en Define, Measure, Analyze, Improve y Control.', priority: 'CRITICAL' },
          { title: 'Cálculo automatizado de métricas de calidad y nivel Six Sigma', description: 'Fórmula de DPMO y nivel sigma basado en defectos por millón.', priority: 'HIGH' }
        ]
      },
      {
        title: 'Diagramas Ishikawa 6M & Pareto',
        category: 'frontend',
        is_automated_github: false,
        position_x: 380,
        position_y: 220,
        default_tasks: [
          { title: 'Interfaz interactiva de espina de pescado con ponderación 6M', description: 'Clasificación de causas raíz en Manpower, Machinery, Methods, etc.', priority: 'HIGH' },
          { title: 'Gráfico de Pareto 80/20 interactivo con cuantificación de costos', description: 'Visualización del 20% de factores que generan el 80% de pérdidas.', priority: 'HIGH' }
        ]
      },
      {
        title: 'Bus de Telemetría WebSocket & Webhook Master',
        category: 'devops',
        is_automated_github: true,
        github_trigger_event: 'workflow_run',
        position_x: 680,
        position_y: 220,
        default_tasks: [
          { title: 'Configuración de enrutador criptográfico de Webhook Master', description: 'Despacho con routing_key única y validación HMAC para CI/CD.', priority: 'HIGH' },
          { title: 'Transición reactiva de nodos DAG en respuesta a telemetría', description: 'Sincronización en vivo entre GitHub Actions y el tablero de operaciones.', priority: 'CRITICAL' }
        ]
      },
      {
        title: 'Memoria Continua con pgvector & Cerebro Nexus',
        category: 'infra',
        is_automated_github: false,
        position_x: 980,
        position_y: 220,
        default_tasks: [
          { title: 'Configuración de extensión pgvector e índices HNSW en Neon', description: 'Búsqueda semántica de coseno (<100ms) sobre lecciones aprendidas.', priority: 'CRITICAL' },
          { title: 'Worker BullMQ de asimilación semántica de proyectos cerrados', description: 'Extracción de artefactos, cálculo de embeddings 1536-D y persistencia.', priority: 'HIGH' }
        ]
      }
    ]
  };

  /**
   * Genera el grafo DAG completo de dependencias técnicas y tareas atómicas para un proyecto
   * según su arquetipo seleccionado.
   */
  public static async generate(
    client: PoolClient,
    projectId: string,
    techStack: Record<string, unknown> = {},
    archetype?: ProjectArchetype
  ): Promise<{ workflowId: string; nodeIds: string[]; edgeCount: number }> {
    // 1. Resolver el arquetipo
    const resolvedArchetype: ProjectArchetype = 
      archetype || 
      (techStack.archetype as ProjectArchetype) || 
      'OPEX_MANAGEMENT';

    const sequence: BlueprintNodeDef[] = 
      this.ARCHETYPE_SEQUENCES[resolvedArchetype] || 
      this.ARCHETYPE_SEQUENCES.OPEX_MANAGEMENT;

    // 2. Crear o actualizar el workflow principal
    const wfRes = await client.query(
      `INSERT INTO project_workflows (project_id, name) 
       VALUES ($1, $2)
       ON CONFLICT (project_id) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [projectId, `DAG: ${resolvedArchetype.replace('_', ' ')} Workflow`]
    );
    const workflowId = wfRes.rows[0].id;

    // 3. Limpiar nodos y tareas previas si se está regenerando el blueprint
    await client.query(`DELETE FROM workflow_nodes WHERE workflow_id = $1`, [workflowId]);

    const projRes = await client.query(
      `SELECT workspace_id FROM projects WHERE id = $1`,
      [projectId]
    );
    const workspaceId = projRes.rows[0]?.workspace_id || '00000000-0000-0000-0000-000000000001';

    const createdNodeIds: string[] = [];

    // 4. Sembrar nodos en estado RED con sus tareas atómicas en TODO
    for (let order = 0; order < sequence.length; order++) {
      const def = sequence[order];
      const slug = `${resolvedArchetype.toLowerCase()}_${def.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

      const nodeRes = await client.query(
        `INSERT INTO workflow_nodes 
          (workflow_id, slug, label, title, category, position_x, position_y, status, is_automated_github, github_trigger_event, step_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'RED', $8, $9, $10)
         RETURNING id`,
        [
          workflowId,
          slug,
          def.title,
          def.title,
          def.category,
          def.position_x,
          def.position_y,
          def.is_automated_github,
          def.github_trigger_event || null,
          order + 1
        ]
      );
      const nodeId = nodeRes.rows[0].id;
      createdNodeIds.push(nodeId);

      // Insertar tareas del nodo
      for (const t of def.default_tasks) {
        const taskRes = await client.query(
          `INSERT INTO project_tasks 
            (workspace_id, project_id, title, description, priority, status)
           VALUES ($1, $2, $3, $4, $5, 'TODO') 
           RETURNING id`,
          [workspaceId, projectId, t.title, t.description, t.priority]
        );
        const taskId = taskRes.rows[0].id;

        await client.query(
          `INSERT INTO workflow_node_tasks (node_id, task_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [nodeId, taskId]
        );
      }
    }

    // 5. Vincular nodos contiguos mediante edges secuenciales
    let edgeCount = 0;
    for (let i = 0; i < createdNodeIds.length - 1; i++) {
      await client.query(
        `INSERT INTO workflow_edges (workflow_id, source_node_id, target_node_id) 
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [workflowId, createdNodeIds[i], createdNodeIds[i + 1]]
      );
      edgeCount++;
    }

    return { workflowId, nodeIds: createdNodeIds, edgeCount };
  }
}
