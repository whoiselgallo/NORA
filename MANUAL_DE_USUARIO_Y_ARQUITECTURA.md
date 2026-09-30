# MANUAL TÉCNICO Y GUÍA DE OPERACIÓN INTEGRAL
## Plataforma Nexus Architect Suite & Antigravity Ecosystem

---

## 1. INTRODUCCIÓN Y ARQUITECTURA GENERAL

**Nexus Architect Suite** es una plataforma integral de ingeniería de software, orquestación de flujos de trabajo (DAG), gestión colaborativa de tareas, telemetría de CI/CD en tiempo real y automatización de marketing por correo masivo.

### Stack Tecnológico
* **Frontend:** React + TypeScript, React Flow (`@xyflow/react`), Tailwind CSS, HTML5 Canvas/SVG nativo.
* **Backend:** Node.js con Express y TypeScript.
* **Base de Datos:** PostgreSQL en la nube (Neon Cloud con connection pooling).
* **Procesamiento Asíncrono / Colas:** Redis con BullMQ.
* **Comunicación en Tiempo Real:** WebSockets (Socket.IO) con aislamiento de salas por proyecto (`project:${projectId}`).
* **Seguridad Criptográfica:** Validación de firmas HMAC-SHA256 con módulo nativo `crypto` de Node.js.

---

## 2. GUÍA DE MÓDULOS Y FUNCIONES

### 2.1. Hub Central y Landing Page (`index.html`)
Es el punto de entrada unificado que centraliza todas las funciones de la plataforma.

* **Top Telemetry Strip:** Monitores de estado en vivo de base de datos Neon, WebSockets y colas BullMQ.
* **Matriz de Módulos (Cards):** Acceso rápido con filtrado por categorías (*Ingeniería & DAG*, *IA & Directivas*, *Marketing*, *Comercial & ROI*).
* **Simulador Interactivo de Grafo DAG:**
  * Visualización en vivo de los 5 nodos del proyecto.
  * Botones de prueba para transiciones de tareas To-Do, Webhooks de GitHub y campañas BullMQ.
  * Consola de logs de eventos en tiempo real simulando la conexión `Socket.IO`.
* **Atajos de Teclado:**
  * `1`: Desplazarse al simulador interactivo de DAG.
  * `2`: Abrir Antigravity Prompt Architect.
  * `3`: Abrir el Generador de Lockups Técnicos CAD.
  * `Esc`: Cerrar cualquier ventana modal activa.

---

### 2.2. Antigravity Prompt Architect (`prompt_architect.html`)
Herramienta de formulación de requerimientos técnicos e instrucciones de sistema para LLMs.

* **Espacio de Trabajo (Texto Plano):** El usuario describe libremente en lenguaje natural su visión del proyecto, módulos, funciones y reglas de negocio.
* **Parser y Auto-Detección Léxica:**
  * Analiza en tiempo real términos como *PostgreSQL*, *Redis*, *BullMQ*, *React Flow*, *HMAC*, *Webhooks*, *Roles*, etc.
  * Pre-rellena automáticamente el checklist de requerimientos.
* **Checklist Interactivo por Fases (Fases 1 a 5):**
  * **Fase 1:** Base de datos y modelado DDL.
  * **Fase 2:** Blueprint Engine y generación automática del DAG.
  * **Fase 3:** Webhooks de GitHub y telemetría de CI/CD.
  * **Fase 4:** Gestor To-Do y algoritmo binario de color.
  * **Fase 5:** Lienzo React Flow y controles de permisos.
* **Generador de Directivas de Sistema:** Compila la configuración en una directiva estricta formateada (`[CORE_PROTOCOL: LEAN_EXECUTION]`) lista para copiar e inyectar en modelos de lenguaje.

---

### 2.3. Pizarrón Dinámico DAG y Algoritmo Binario (`WorkflowCanvas.tsx`, `CustomNode.tsx`)
Visualizador de arquitectura basado en grafos acíclicos dirigidos.

* **Nodos Generados Automáticamente:**
  1. `infraestructura_base_de_datos`: Infraestructura y Neon PostgreSQL.
  2. `servicios_core_api_rest`: API REST y Controladores Express.
  3. `interfaz_de_usuario_react_flow`: UI React y React Flow.
  4. `telemetr_a_webhooks_github`: Ingesta y validación de Webhooks.
  5. `campa_a_de_mercadotecnia_masiva`: Campañas masivas de correo.
* **Algoritmo Binario de Color:**
  * **Estado RED (`#EF4444`):** Nodo pendiente. Se activa si al menos una tarea asociada no está completada o si el webhook no ha concluido con éxito.
  * **Estado GREEN (`#10B981` con resplandor esmeralda):** Se activa única y exclusivamente cuando el 100% de las tareas manuales del nodo tienen estado `DONE`, o la condición de automatización se satisface.
* **Control de Acceso por Rol (Role Guard):**
  * Rol `CLIENT`: Modo solo lectura. Bloqueo de drag-and-drop de nodos y deshabilitación de mutación de tareas.
  * Rol `COLLABORATOR` y `ADMIN`: Acceso completo a interacción y cambios de estado.

---

### 2.4. Gestor Colaborativo de Tareas To-Do (`taskManager.service.ts`)
* **Campos:** Título, descripción, prioridad (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), estado (`TODO`, `IN_PROGRESS`, `REVIEW`, `DONE`), responsable y fecha límite.
* **Sincronización Reactiva:** Latencia menor a 200 ms hacia todos los clientes suscritos a la sala WebSocket del proyecto.
* **Protección de Edición:** Validación en middleware para impedir que usuarios con rol `CLIENT` modifiquen tareas asignadas al equipo de desarrollo (HTTP 403 Forbidden).

---

### 2.5. Telemetría de GitHub Webhooks (`github.handler.ts`)
* **Endpoint:** `POST /api/v1/telemetry/github`
* **Seguridad:** Verificación del encabezado `X-Hub-Signature-256` calculando el digest con `crypto.createHmac('sha256', GITHUB_WEBHOOK_SECRET)`. Firmas no coincidentes reciben respuesta inmediata `401 Unauthorized`.
* **Procesamiento de Eventos:**
  * Evento `workflow_run`: Si `conclusion == "success"`, localiza los nodos con `is_automated_github = true` y transmuta su estado a `GREEN`.
  * Emisión de eventos `TELEMETRY_PULSE` y `WORKFLOW_NODE_TRANSITION` a la sala del proyecto.
  * Persistencia en la tabla `github_telemetry_events` con duración de build, autor y commit SHA.

---

### 2.6. Motor de Campañas Masivas y Email Marketing (`campaignDispatcher.service.ts`, `emailQueue.worker.ts`)
* **Despacho Asíncrono:** Empleo de colas BullMQ con control de tasa (rate limiting) y backoff exponencial para evitar bloqueos por límites de proveedores.
* **Lista de Supresión Automática:** Comprobación estricta contra `marketing_suppression_list` para omitir usuarios dados de baja o rebotados.
* **Cumplimiento RFC 8058:** Inyección obligatoria de cabeceras `List-Unsubscribe` y `List-Unsubscribe-Post` para desuscripción en un clic.
* **Métricas y Píxeles de Rastreo:**
  * Píxel transparente 1x1 (`/api/v1/marketing/tracking/pixel/:logId.gif`) para registrar aperturas.
  * Redirección 302 (`/api/v1/marketing/tracking/click/:logId`) para auditoría de clics en enlaces.
* **Regla del 95% de Entrega:** Cuando una campaña en ejecución alcanza un porcentaje de entrega exitosa igual o superior al 95%, el nodo de marketing en el DAG conmuta automáticamente a `GREEN`.

---

### 2.7. Estudio CAD Vectorial // Generador de Lockups (`generador_lockups_tecnicos.html`)
* Entorno de diseño técnico en SVG para arquitecturas de software y marcas de ingeniería.
* Controles interactivos de geometría, tipografías monoespaciadas, márgenes, bordes e iluminación.
* Exportación directa a código SVG, descarga de archivo vectorial `.svg` y renderizado a JPEG/PNG.
* Persistencia local de diseños con selector rápido.

---

### 2.8. Propuestas Comerciales y Modelos de Retorno de Inversión (ROI)
* **`MPS_AYALA_PROPUESTA_ROI_001.html`:** Análisis cuantitativo de inversión, ahorro operativo por automatización, mitigación fiscal y desglose del período de recuperación de inversión.
* **`PROPUESTA DE SERVICIOS Y SOLUCIONES DIGITALES MPS AYALA..html`:** Propuesta de valor integral que incluye alcance de modernización tecnológica, pasarela de pagos y catálogo de inventario.

---

## 3. CATÁLOGO DE RUTAS Y ENDPOINTS DE LA API

| Método | Ruta | Descripción | Seguridad / Roles |
|---|---|---|---|
| `POST` | `/api/v1/projects` | Crea proyecto y genera DAG automático | ADMIN, COLLABORATOR |
| `GET` | `/api/v1/projects/:projectId/workflow` | Obtiene nodos, aristas y tareas del DAG | Todos los roles |
| `POST` | `/api/v1/projects/:projectId/tasks` | Crea una nueva tarea asociada a un nodo | ADMIN, COLLABORATOR |
| `PATCH` | `/api/v1/tasks/:taskId/status` | Actualiza estado y evalúa regla binaria | ADMIN, COLLABORATOR |
| `POST` | `/api/v1/telemetry/github` | Webhook de GitHub (workflow_run, push, PR) | HMAC-SHA256 |
| `POST` | `/api/v1/marketing/campaigns/:id/dispatch` | Inicia despacho masivo con BullMQ | ADMIN |
| `GET` | `/api/v1/marketing/tracking/pixel/:logId.gif` | Píxel de apertura 1x1 | Público |
| `GET` | `/api/v1/marketing/tracking/click/:logId` | Rastreador de clic y redirección 302 | Público |
| `POST` | `/api/v1/marketing/webhooks/bounce` | Webhook de rebotes y quejas SPAM | Proveedor / API Key |

---

## 4. PROPUESTAS DE OPTIMIZACIÓN Y MEJORAS DE LA PLATAFORMA

### 4.1. Rendimiento y Caché (Performance)
1. **Caché en Redis de Grafos DAG Frecuentes:**
   * Actualmente cada lectura consulta PostgreSQL. Implementar una capa de lectura en Redis con invalidación automática cuando ocurra un evento `TASK_STATUS_UPDATED` o `WORKFLOW_NODE_TRANSITION`.
2. **Virtualización de Listas de Tareas Extensas:**
   * Si un proyecto supera las 150 tareas, integrar `@tanstack/react-virtual` en el componente To-Do para evitar sobrecarga en el DOM del navegador.
3. **Agrupación de Envíos Masivos (Batching):**
   * En BullMQ, enviar paquetes de 50 correos por job en lugar de trabajos individuales por destinatario para reducir la carga de conexiones concurrentes en Redis.

### 4.2. Seguridad y Gobernanza
1. **Autenticación JWT / Sesiones con Neon Auth:**
   * Sustituir el paso de headers simples de usuario por tokens JWT firmados con rotación periódica.
2. **Rate Limiting en Endpoints Públicos:**
   * Aplicar `express-rate-limit` a las rutas de tracking (`/pixel` y `/click`) para mitigar ataques de scraping o desbordamiento de búfer.
3. **Validación de Esquema con Zod:**
   * Integrar middlewares con schemas Zod en todos los endpoints `POST` y `PATCH` para garantizar validación en tiempo de ejecución.

### 4.3. Experiencia de Usuario (UX / UI)
1. **Modo Edición Interactiva del DAG (Canvas Visual):**
   * Permitir que usuarios administradores puedan crear nuevos nodos y conectar aristas arrastrando conectores directamente sobre el lienzo de React Flow.
2. **Tema Dual (Dark Cyberpunk / Light Corporate):**
   * Aunque el modo oscuro cibernético ofrece máxima estética técnica, para presentaciones de ROI corporativo ante directores de finanzas es valioso un botón de modo claro de alto contraste.
3. **Notificaciones Push y Sonido de Telemetría:**
   * Incorporar micro-sonidos sutiles cuando un nodo conmute a verde o cuando se registre un despliegue exitoso de GitHub Actions.

### 4.4. Observabilidad y Monitoreo
1. **Dashboard de Métricas BullMQ (Bull-Board):**
   * Montar `/admin/queues` protegido con interfaz visual de Bull-Board para inspeccionar en tiempo real trabajos en espera, activos, completados y fallidos.
2. **Exportador OpenTelemetry / Prometheus:**
   * Exponer una ruta `/metrics` con contadores de latencia de webhooks, tiempos de respuesta de base de datos y eventos de WebSocket emitidos.
