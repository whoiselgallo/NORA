# MANUAL OPERATIVO, COTIZADOR DINÁMICO Y BLUEPRINT DE INGENIERÍA
## Sistema de Producción de Software a Demanda & Arquitectura de Costos

> **TSolutions IPIDD** • *“Tecnología instalada. Conocimiento transferido. Negocios escalados.”*

---

## SECCIÓN 1: Resumen Ejecutivo del Ciclo de Vida (6 Fases)

| Fase | Nombre de la Etapa | Componentes Clave e Integraciones | Reglas de Negocio, Seguridad & Ahorro de Tokens |
| :---: | :--- | :--- | :--- |
| **Fase 1** | **Selección, Clasificación y Arquitectura Base** | • **Hosting:** Vercel (Estático/SSR) vs. Render / Google Cloud (PHP/Node Backend).<br>• **Datos:** Neon PostgreSQL / Supabase / Render DB + AWS S3 / Cloudflare R2 (Multimedia).<br>• **Autogestión:** Headless CMS (Payload, Sanity, Strapi). | • Entornos serverless efímeros; archivos a Object Storage.<br>• Snapshots obligatorios y respaldos diarios (7 a 30 días de retención).<br>• Cero duplicidad en aprovisionamiento de bases de datos. |
| **Fase 2** | **Servicios, Identidad, Pagos, IA y Seguridad** | • **Auth & RBAC:** Clerk / Auth.js / Supabase Auth con 2FA y roles.<br>• **Pagos:** Stripe (Checkout, Billing, Payouts).<br>• **IA & Queues:** Gemini AI / OpenAI / Anthropic + BullMQ / Inngest / Trigger.dev.<br>• **Email:** Resend / SendGrid / Postmark. | • **Stripe:** Validación de firma (`STRIPE_WEBHOOK_SECRET`) e idempotencia.<br>• **Protección Financiera de IA:** Rate Limiting con Upstash Redis por IP/Usuario y **Hard Limits mensuales en consola**.<br>• **DNS:** Registros SPF, DKIM y DMARC + secretos en bóvedas `.env`. |
| **Fase 3** | **Motor de Presupuestación Dinámica** | • Cálculo automatizado de horas por complejidad (Baja, Media, Alta a tarifa base $35 USD o equivalente MXN).<br>• Cotización de servicios de terceros en tiempo real.<br>• Calculadora de consumo variable de tokens y pasarelas. | • Separación estricta en:<br>  1. **CapEx** (Inversión inicial de construcción).<br>  2. **OpEx** (Consumo mensual directo de terceros).<br>  3. **Retainer** (Póliza de mantenimiento y soporte).<br>  4. **Cuota Única de Plataforma (5%)** para espacios colaborativos. |
| **Fase 4** | **Documento de Creación e Ingeniería (Blueprint)** | • Especificación de stack por capa (Frontend vs. Backend).<br>• Mapeo de contratos JSON Schema y árbol de directorios.<br>• Cronograma por hitos.<br>• Módulo de SEO técnico y cumplimiento legal. | • Inclusión obligatoria de `sitemap.xml`, `robots.txt`, Schema.org, GA4/PostHog.<br>• Páginas legales adaptadas a IA, protección de datos y Stripe.<br>• Contratos de API tipados sin ambigüedades. |
| **Fase 5** | **Desarrollo, DevSecOps y Despliegue (CI/CD)** | • Repositorio GitHub Privado + `.gitignore` blindado.<br>• Escaneo automatizado de vulnerabilidades con Snyk / Dependabot.<br>• Despliegue automatizado con Preview URLs (Vercel) / Zero-Downtime (Render). | • Pruebas E2E en *Stripe Test Mode* antes de usar llaves live.<br>• Auditoría Google Lighthouse exigiendo **>90 puntos** en Rendimiento, Accesibilidad y SEO.<br>• Bloqueo estricto de secretos en commits. |
| **Fase 6** | **Cierre, Monitoreo y Entregables Finales** | • Telemetría de excepciones en tiempo real (Sentry) y monitor de disponibilidad (Uptime Robot / BetterStack).<br>• Verificación del primer ciclo exitoso de backups. | • Traspaso de facturación (Modalidad A - Entrega Total) o activación de iguala mensual (Modalidad B - Retainer).<br>• Firma de Acta de Entrega, entrega de código y diccionario `.env.example`. |

---

## SECCIÓN 2: Plantilla del Cotizador Dinámico (Fase 3)

### 2.1 Matriz de Cálculo por Módulo y Complejidad (Tarifa Base: $35 USD / hora o $700 MXN / hora)

| Categoría / Fase | Módulo / Servicio | Complejidad | Activo (1/0) | Horas Est. | Tarifa Hora (USD) | CapEx: Desarrollo (USD) | OpEx: Mensual Terceros (USD) | Proveedor / Notas Técnicas & Reglas de Consumo |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **1. INFRAESTRUCTURA** | Hosting Estático / Landing Page | Baja | 1 | 4 | $35 | $140 | $0 | Vercel Hobby ($0) / Cloudflare Pages. CDN global. |
| **1. INFRAESTRUCTURA** | Hosting Frontend Pro / SSR | Media | 0 | 6 | $35 | $0 | $20 | Vercel Pro ($20/mes) para tráfico empresarial concurrente. |
| **1. INFRAESTRUCTURA** | Servidor Backend PHP / Node / Python | Media | 1 | 10 | $35 | $350 | $25 | Render Standard ($25/mes) o Google Cloud Run para procesos persistentes. |
| **1. INFRAESTRUCTURA** | Base de Datos SQL / NoSQL + Backups | Media | 1 | 8 | $35 | $280 | $25 | Neon PostgreSQL / Supabase DB con Snapshots diarios programados. |
| **1. INFRAESTRUCTURA** | Almacenamiento Multimedia (Object Storage)| Baja | 1 | 5 | $35 | $175 | $5 | AWS S3 / Cloudflare R2 / Cloudinary (sin saturar servidor web). |
| **1. INFRAESTRUCTURA** | Headless CMS (Autogestión de Contenidos) | Media | 0 | 14 | $35 | $0 | $15 | Payload CMS / Sanity / Strapi para autogestión sin tocar código. |
| **2. SERVICIOS Y SEG.**| Autenticación y Roles (Auth & RBAC) | Media | 1 | 12 | $35 | $420 | $0 | Clerk / Supabase Auth / Auth.js (2FA, roles y sesiones seguras). |
| **2. SERVICIOS Y SEG.**| Pasarela Stripe + Webhooks Idempotentes | Alta | 1 | 20 | $35 | $700 | $0 | Stripe Checkout / Billing (firma criptográfica e idempotencia en BD). |
| **2. SERVICIOS Y SEG.**| **Integración IA + Rate Limiting Financiero**| Alta | 1 | 24 | $35 | $840 | $30 | **OpenAI / Anthropic / Gemini con Hard Limit en consola + Upstash Redis Rate Limiting**.|
| **2. SERVICIOS Y SEG.**| Colas Asíncronas (Queues / Cron Jobs) | Alta | 0 | 16 | $35 | $0 | $10 | Inngest / Trigger.dev / BullMQ para reportes pesados y webhooks. |
| **2. SERVICIOS Y SEG.**| Email Transaccional + Configuración DNS | Baja | 1 | 5 | $35 | $175 | $20 | Resend / SendGrid con registros obligatorios SPF, DKIM y DMARC. |
| **4. FRONTEND Y LEGAL**| Maquetación UI/UX (Landing / Vistas) | Baja | 1 | 16 | $35 | $560 | $0 | Next.js / Astro / React + Tailwind CSS con accesibilidad y diseño responsive. |
| **4. FRONTEND Y LEGAL**| SEO Técnico, Schema.org y Analítica | Baja | 1 | 6 | $35 | $210 | $0 | Sitemap dinámico, robots.txt, metadatos OpenGraph y Google Analytics 4. |
| **4. FRONTEND Y LEGAL**| Cumplimiento Legal (Privacidad, T&C, Cookies)| Baja | 1 | 4 | $35 | $140 | $0 | Aviso de Privacidad formal, Términos adaptados a IA/Stripe y Cookie Banner. |
| **5. DEVSECOPS Y QA** | CI/CD, Entornos (.env) y Escaneo Snyk | Media | 1 | 8 | $35 | $280 | $0 | Repositorio GitHub Privado, Preview URLs y auditoría Lighthouse > 90. |
| **6. MONITOREO** | Monitoreo Errores (Sentry) y Uptime | Baja | 1 | 4 | $35 | $140 | $0 | Sentry Error Tracking + monitor de disponibilidad BetterStack / Uptime Robot. |
| **TOTALES BASE** | **SUMATORIA CONSOLIDADA (ESCENARIO EJEMPLO)**| - | - | **126 hrs**| - | **$4,410 USD** | **$105 USD/mes** | *(Equivalente a ~$88,200 MXN de CapEx y ~$2,100 MXN/mes de OpEx).* |

---

### 2.2 Calculadora de Consumo Variable y Resumen Financiero

| Concepto Financiero | Parámetro de Entrada | Resultado Estimado | Explicación Comercial & Reglas de Protección para el Cliente |
| :--- | :---: | :---: | :--- |
| **Volumen Mensual Ventas Stripe** | $5,000 USD | $195.00 USD | Comisión estándar Stripe (~3.6% + comisión fija local por cada transacción procesada). |
| **Peticiones a la API de IA por Mes** | 10,000 llamadas | **$0.15 - $15.00 USD** | **Optimización de Tokens:** Estimación basada en destilación de prompts y caché semántica. Protección con **Hard Limit mensual de $25 USD** en consola. |
| **1. Tiempo Estimado de Entrega** | 126 horas | **21 días hábiles** | Calculado a razón de 6 horas efectivas de ingeniería por jornada hábil. |
| **2. Inversión Inicial (CapEx - Pago Único)** | - | **$4,410.00 USD** | Construcción completa, arquitectura, pruebas QA y despliegue a producción. |
| **3. Costo Operativo Fijo (OpEx Mensual)** | - | **$105.00 USD / mes** | Pago directo del cliente a proveedores cloud (hosting, BD, backups diarios, email y almacenamiento). |
| **4. Póliza Mantenimiento (Retainer Mensual)** | 10% CapEx | **$441.00 USD / mes** | Modalidad B: Soporte continuo, monitoreo Sentry 24/7, parches de seguridad Snyk y backups diarios. |
| **5. Cuota Única de Plataforma Colaborativa (5%)**| 5% CapEx | **$220.50 USD** | Pago único al cierre del contrato para sostener la infraestructura de desarrollo y entornos colaborativos dedicados. |

---

## SECCIÓN 3: Plantilla del Documento de Creación e Ingeniería (Fase 4 - Blueprint)

### 3.1 Ficha de Identificación del Proyecto
* **ID del Proyecto:** `[PRJ-2026-XXX]`
* **Nombre del Cliente / Empresa:** `[Nombre del Cliente o Empresa]`
* **Categoría de Arquitectura:**
  * `[ ]` Opción A: Estático / Jamstack (Vercel)
  * `[ ]` Opción B: Backend PHP / APIs Node (Render / Google Cloud)
  * `[X]` Opción C: Full-Stack Híbrido SSR + Inteligencia Artificial (Vercel + Render + Neon Postgres)
* **Modalidad Post-Entrega:**
  * `[ ]` Modalidad A: Entrega Total al Cliente (Traspaso de cuentas maestras y facturación)
  * `[X]` Modalidad B: Servicio Gestionado (Retainer mensual de soporte y monitoreo)
* **Fecha de Inicio / Fecha Compromiso de Entrega:** `[DD/MM/AAAA]` al `[DD/MM/AAAA]` (`[21]` días hábiles).

### 3.2 Especificación de Stack Tecnológico y Despliegue por Capa
* **Frontend (UI/UX):** TypeScript + Next.js / React + Tailwind CSS. Despliegue en **Vercel** con CI/CD automático conectado a la rama `main` y Preview URLs para staging.
* **Backend / API:** Node.js (Express/NestJS) o Python (FastAPI). Despliegue en **Render Web Services / Google Cloud Run** con Dockerfile optimizado y Zero-Downtime Deployment.
* **Base de Datos y Respaldos:** **Neon PostgreSQL Lakebase** con conexión SSL cifrada, branches efímeras para pruebas y Snapshots automatizados diarios con retención de 30 días.
* **Object Storage (Multimedia):** SDK S3-Compatible conectado a **Cloudflare R2 / AWS S3**, impidiendo saturación del servidor web.
* **Identidad y Roles (Auth & RBAC):** JWT / OAuth 2.0 con **Clerk / Supabase Auth** con soporte para 2FA y roles (`Admin`, `Client`, `Operator`).
* **Colas Asíncronas (Workers):** **BullMQ sobre Upstash Redis** o Inngest para ejecutar tareas pesadas de IA y reportes sin provocar timeouts HTTP.

### 3.3 Matriz de Integración de APIs (Nativas vs. Terceros)
* **Pasarela de Pagos (Externa):** Stripe API. Endpoints: `/api/webhooks/stripe`. Eventos: `checkout.session.completed`, `invoice.paid`, `payment_intent.succeeded`. Medida de seguridad: Validación de firma con `STRIPE_WEBHOOK_SECRET` y tabla de idempotencia en BD.
* **Motor de IA (Externa con Blindaje de Tokens):** Google AI Studio / Gemini 2.5 Flash / OpenAI API. Endpoints: `/api/ai/chat`, `/api/ai/analyze`. Medida de seguridad: **Middleware de Rate Limiting con Upstash Redis (máx. 20 peticiones/min por IP) y Hard Limit de gasto en consola**.
* **Correo Transaccional (Externa):** Resend API. Endpoints: `/api/mail/send`. Medida de seguridad: Dominio verificado con registros DNS SPF, DKIM y DMARC.
* **API de Negocio Propia (Nativa):** Endpoints RESTful `/api/v1/...` con contratos validados mediante JSON Schema / Zod y protección mediante middleware RBAC.

### 3.4 Estructura de Directorios del Proyecto
```
├── .github/workflows/          # Pipelines CI/CD y escaneo de vulnerabilidades (Snyk)
├── src/
│   ├── app/ (o pages/)         # Vistas Frontend, Landing Pages y páginas legales
│   ├── components/             # Componentes UI reutilizables y Banner de Cookies
│   ├── lib/
│   │   ├── stripe/             # Cliente Stripe, Checkout y validación de Idempotencia
│   │   ├── ai/                 # Integración de IA y middleware de Rate Limiting (Upstash)
│   │   ├── storage/            # Conectores para Cloudflare R2 / AWS S3
│   │   └── auth/               # Configuración de identidad, 2FA y permisos por rol (RBAC)
│   ├── jobs/ (o workers/)      # Colas asíncronas BullMQ / Inngest
│   └── api/ (o backend/)       # Controladores, modelos y webhooks
├── prisma/ (o migrations/)     # Esquemas de base de datos relacionales y migraciones
├── public/                     # sitemap.xml, robots.txt y recursos estáticos
├── .env.example                # Diccionario de variables de entorno (sin secretos reales)
├── .gitignore                  # Reglas estrictas para bloquear filtración de secretos
└── Dockerfile                  # Configuración de contenedor para Render / Google Cloud
```

### 3.5 Diccionario de Variables de Entorno y Secretos (`.env.example`)
* `DATABASE_URL`: Cadena de conexión cifrada a la base de datos gestionada (Neon / Supabase).
* `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`: Llave pública de Stripe para renderizar formularios de pago seguros en el cliente.
* `STRIPE_SECRET_KEY`: Llave privada de Stripe (almacenada estrictamente en el Backend Secret Vault; jamás expuesta en el cliente).
* `STRIPE_WEBHOOK_SECRET`: Firma criptográfica para validar eventos entrantes del webhook de Stripe.
* `AI_PROVIDER_API_KEY`: Credencial privada de Google AI Studio / Gemini o OpenAI con Hard Limit mensual activado.
* `UPSTASH_REDIS_REST_URL`: Conexión al clúster de Redis para aplicar Rate Limiting por IP/Usuario.
* `RESEND_API_KEY`: Llave de API para despacho de correos transaccionales autenticados.
* `S3_ACCESS_KEY_ID / SECRET`: Credenciales de Object Storage para subida de multimedia.
* `SENTRY_DSN`: Endpoint de telemetría y captura de errores en tiempo real.

---

## SECCIÓN 4: Checklist de Cierre y Acta de Entrega Final (Fase 6)

### 4.1 Checklist de Validación Pre-Entrega
* `[ ]` **Seguridad de Código:** Repositorio en GitHub en modo Privado, `.gitignore` auditado y escaneo de dependencias con Snyk sin alertas críticas.
* `[ ]` **Auditoría de Calidad:** Reporte de Google Lighthouse con puntuación superior a **>90 puntos** en Rendimiento, Accesibilidad, Mejores Prácticas y SEO.
* `[ ]` **Validación Transaccional:** Pruebas E2E superadas en *Stripe Test Mode* con simulación de tarjetas rechazadas/aprobadas y cambio validado a llaves `pk_live_` / `sk_live_`.
* `[ ]` **Control Financiero de IA:** Rate Limiting verificado en Upstash Redis y Hard Limit mensual de tokens configurado en el panel del proveedor.
* `[ ]` **Continuidad y Monitoreo:** Primer ciclo exitoso de respaldos automáticos de base de datos verificado y alertas activadas en Sentry y Uptime Robot.
* `[ ]` **Traspaso de Facturación / Póliza:** Métodos de pago del cliente vinculados a plataformas (Modalidad A) o Póliza de Mantenimiento Mensual activa (Modalidad B).
* `[ ]` **Entrega Documental:** Manual de operación del sitio/CMS, accesos maestros y diccionario `.env.example` entregados al cliente.

### 4.2 Conciliación del Presupuesto Final y Aceptación
* **Inversión Inicial Aprobada (CapEx):** `$[Monto] USD / MXN`
* **Cuota Única de Plataforma Colaborativa (5%):** `$[Monto] USD / MXN`
* **Costo Operativo Mensual de Terceros (OpEx Estimado):** `$[Monto] USD / MXN`
* **Modalidad Operativa Seleccionada:**
  * `[ ]` Modalidad A (Entrega Total al Cliente)
  * `[X]` Modalidad B (Servicio Gestionado - Retainer Mensual: `$[Monto] USD / MXN`)

```
____________________________________________________
Nombre y Firma del Cliente / Representante Autorizado
Fecha: [DD/MM/AAAA]
```
