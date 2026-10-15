# DOCUMENTO MAESTRO DEFINITIVO
## Flujo de Trabajo para Plataforma de Producción de Sitios Web a Demanda (100% Integral)

> **TSolutions IPIDD** • *“Tecnología instalada. Conocimiento transferido. Negocios escalados.”*  
> Este documento establece el estándar operativo, arquitectónico y financiero para la producción de cualquier proyecto web a demanda, integrando las 7 recomendaciones de blindaje técnico y las 5 áreas de cobertura universal (**Autenticación, CMS, Respaldos, SEO/Analítica y Colas Asíncronas**).

---

## Fase 1: Selección, Clasificación y Arquitectura Base

Define el alcance técnico a partir de la elección del cliente y activa el árbol de decisiones para infraestructura, cómputo, identidad, gestión de contenidos y persistencia de datos.

### 1.1 Cuestionario de Selección del Cliente
* **Recepción y Diagnóstico:** Levantamiento de objetivos comerciales del negocio, volumen de tráfico proyectado (usuarios concurrentes), necesidad de cuentas de usuario finales, nivel de autogestión de contenidos, pasarelas de cobro, módulos de inteligencia artificial y almacenamiento de archivos multimedia.

### 1.2 Árbol de Decisión de Infraestructura y Hosting
* **Opción A: Sitio Estático / Landing Page:**
  * Recomendación automática y prioritaria: **Vercel** (o Cloudflare Pages).
  * Justificación: Eficiencia máxima de costos ($0 en capa base), red perimetral CDN global de ultra-baja latencia y despliegue instantáneo con preview URLs automáticas.
* **Opción B: Aplicación con Backend o APIs en PHP / Node.js:**
  * Recomendación: **Render** (Web Services nativos o Docker) o **Google Cloud** (App Engine / Cloud Run).
  * Justificación: Manejo confiable de procesos persistentes, webhooks de larga duración y contenedores aislados.
* **Opción C: Aplicación Web Full-Stack Moderna / SSR / Microservicios:**
  * Recomendación: **Arquitectura Híbrida**: Frontend desacoplado en **Vercel** (Next.js / React / Astro) y servicios pesados, workers o APIs en **Render / Google Cloud Run**.

### 1.3 Árbol de Decisión de Persistencia, Almacenamiento y Respaldos
* **Sin Base de Datos:** Sitios exclusivamente informativos o formularios de captura conectados directamente por webhook a CRM o Email (Resend).
* **Bases de Datos Relacionales (SQL) / NoSQL:** Selección automatizada de bases de datos serverless gestionadas (**Neon PostgreSQL, Supabase, PlanetScale o Render PostgreSQL**). Evita el uso de almacenamiento local en contenedores dado que los entornos serverless son efímeros.
* **Almacenamiento de Objetos (Object Storage):** Si el proyecto requiere subida de comprobantes, imágenes, PDFs o videos de inventario, se integra obligatoriamente **AWS S3, Cloudflare R2 o Cloudinary**. Nunca saturar el servidor web ni arriesgar archivos ante reinicios de instancias.
* **Estrategia de Respaldos (Backups & DRP):** Configuración obligatoria de Snapshots diarios automatizados de la base de datos con política de retención programada de **7 a 30 días** para recuperación ante desastres.

### 1.4 Gestor de Contenidos (Headless CMS) para Autogestión
* Si el cliente requiere modificar textos, blog, catálogo o precios sin tocar código ni depender de la agencia, se implementa un **Headless CMS** (**Payload CMS, Sanity, Strapi o Contentful**) o un panel administrativo a medida conectado por API.

---

## Fase 2: Configuración de Servicios, Identidad, Pagos, IA y Seguridad

Establece las integraciones de terceros, autenticación, procesamiento asíncrono, blindaje de APIs y configuración segura de secretos.

### 2.1 Autenticación, Gestión de Identidad y Roles (Auth & RBAC)
* **Motores de Identidad:** Selección entre **Clerk, Auth.js / NextAuth, Supabase Auth o Firebase Auth**.
* **Seguridad de Acceso:** Configuración de inicio de sesión social (OAuth Google / GitHub), autenticación de dos factores (2FA) y **Control de Acceso Basado en Roles (RBAC)** (ej. *Administrador*, *Cliente Suscrito*, *Usuario Gratuito*, *Cajero de Mostrador*).

### 2.2 Integración Transaccional con Stripe
* **Modelos de Cobro:** Pagos únicos (*PaymentIntents / Stripe Checkout*), suscripciones recurrentes con facturación periódica (*Stripe Billing*), o dispersión de fondos (*Stripe Payouts / Connect*).
* **Arquitectura de Webhooks Robusta:** Endpoints dedicados para escuchar eventos críticos (`invoice.paid`, `payment_intent.succeeded`, `charge.failed`).
* **Blindaje:** Validación criptográfica estricta de firmas mediante `STRIPE_WEBHOOK_SECRET`, **lógica de idempotencia** para impedir cobros dobles ante reintentos de red y registro transaccional en base de datos.

### 2.3 Integración de IA, APIs y Control de Consumo (Optimización Extrema de Tokens)
* **Separación de Servicios:** Distinción clara entre APIs de negocio nativas (REST/GraphQL propias) y APIs de proveedores externos (OpenAI, Anthropic, Google Cloud AI Studio / Gemini).
* **Protección Financiera & Control de Tokens:**
  * Implementación obligatoria de **Rate Limiting** (ej. Upstash Redis por IP y por identificador de usuario) para neutralizar bots o ataques de denegación de servicio.
  * Configuración de **Hard Limits** (techos de gasto mensual inquebrantables en la consola del proveedor de IA) para garantizar que jamás existan picos de facturación imprevistos.
  * **Estrategia de Caché Semántica:** Reutilización de respuestas para consultas repetitivas de catálogos y políticas.
  * **Destilación de Prompts:** Reducción del tamaño de contexto y tokens de entrada hasta en un 65% mediante metaprompts estructurados.

### 2.4 Gestión de Colas Asíncronas (Queues) y Cron Jobs
* Para procesos pesados que superen los límites de tiempo HTTP (Timeouts serverless de 10 a 60 segundos en Vercel/Render): generación de reportes analíticos con IA, procesamiento por lotes de imágenes o envíos masivos.
* Integración de colas en segundo plano: **BullMQ (con Redis), Inngest, Trigger.dev o Render Cron Jobs**.

### 2.5 Correo Transaccional y DNS
* Integración de proveedor de correo vía API (**Resend, SendGrid o Postmark**) para recibos de compra, notificaciones de pedidos, alertas y recuperación de contraseñas.
* **Configuración DNS de Entregabilidad:** Registros obligatorios **SPF, DKIM y DMARC**, vinculados al dominio propio con certificados SSL/TLS automáticos.

### 2.6 Gestión de Variables de Entorno y Secretos (.env)
* **Aislamiento en Tres Niveles:** Desarrollo local (`.env.local`), Pruebas/Staging (`.env.staging`) y Producción (`.env.production`).
* Inyección de credenciales directamente en las bóvedas cifradas de **Vercel Project Settings, Render Environment Secrets o Google Secret Manager**. Prohibición terminante de exponer llaves privadas en el frontend o repositorios.

---

## Fase 3: Motor de Presupuestación Dinámica y Notificación de Costos

Calcula los costos de desarrollo (CapEx) y proyecta los gastos operativos mensuales de terceros (OpEx) en tiempo real.

### 3.1 Cotizador de Servicios de Paga en Tiempo Real
* Detección y cuantificación paramétrica de cada servicio de infraestructura:
  * **Infraestructura y Datos:** Instancias en Render, Vercel Pro, almacenamiento S3/R2, backups diarios y licencias de CMS/Auth si sobrepasan la capa gratuita.
  * **IA y APIs:** Estimación de consumo por cada 1,000 peticiones/tokens según el modelo seleccionado ($0.15 a $15.00 USD).
  * **Transaccional:** Comisiones estándar de pasarelas de pago (~3.6% + comisión fija local) y costo anual de renovación de dominio.

### 3.2 Notificación y Desglose Financiero al Cliente
* **Alerta Transparente:** Notificación automática indicando con precisión qué componentes requieren suscripción o facturación directa por uso.
* **Presupuesto Dividido en Tres Bloques:**
  1. **Inversión Inicial de Construcción (CapEx - Pago Único).**
  2. **Costo Operativo Mensual Estimado de Terceros (OpEx).**
  3. **Póliza de Mantenimiento y Soporte Sugerida (Retainer Mensual).**
  4. **Cuota Única de Plataforma Colaborativa & Mantenimiento (5%):** Pago único al cierre del contrato que sostiene la infraestructura dedicada durante todo el proyecto.

---

## Fase 4: Generación del Documento de Creación e Ingeniería (Blueprint)

Una vez aprobado el presupuesto, la plataforma genera automáticamente el expediente técnico y el cronograma del proyecto.

### 4.1 Especificación de Lenguajes y Stack por Capa
* **Frontend:** TypeScript con React / Next.js / Astro + Tailwind CSS.
* **Backend:** Node.js con Express / NestJS, PHP 8.x con Laravel, o Python con FastAPI.
* **Contratos de Interfaz:** JSON Schema para endpoints RESTful y catálogo estricto de API Keys requeridas.

### 4.2 Estructura de Directorios y Arquitectura
* Árbol de carpetas estandarizado: separación modular de rutas, controladores, modelos, middlewares de autenticación/rate-limiting, workers asíncronos y servicios de pasarelas/IA.

### 4.3 Cronograma Desglosado por Complejidad
* **Baja Complejidad (1-5 días):** Maquetación de Landing Pages, páginas legales, configuración base.
* **Media Complejidad (1-2 semanas):** Autenticación y roles (RBAC), integración de Headless CMS, CRUD de base de datos, correos transaccionales.
* **Alta Complejidad (2-4 semanas):** Pasarela de pagos con Webhooks e idempotencia, flujos de agentes de IA con colas asíncronas, integraciones de APIs a medida.

### 4.4 Módulo de SEO Técnico, Analítica y Cumplimiento Legal
* **SEO y Analítica:** `sitemap.xml`, `robots.txt`, metadatos OpenGraph, Schema.org e integración de Google Analytics 4 / PostHog.
* **Cumplimiento Legal Obligatorio:** Aviso de Privacidad, Términos y Condiciones (detallando procesamiento de datos por IA y transacciones Stripe) y Banner de Consentimiento de Cookies.

---

## Fase 5: Desarrollo, Seguridad DevSecOps y Despliegue (CI/CD)

Ejecución técnica bajo estándares de seguridad industrial y despliegue automatizado.

### 5.1 Control de Versiones y Blindaje de Repositorio
* Creación de repositorio en **GitHub en modo Privado por defecto**.
* `.gitignore` estricto y escaneo automatizado de vulnerabilidades con Snyk / Dependabot para bloquear filtraciones accidentales de llaves en cada commit.

### 5.2 Estrategia de Despliegue según Entorno
* **Jamstack / Vercel:** Conexión CI/CD a la rama `main` para producción y generación automática de Preview URLs por cada rama de staging.
* **Backend / Contenedores (Render / Google Cloud):** `Dockerfile` optimizado, ejecución automática de migraciones de base de datos y despliegue sin tiempo de inactividad (*Zero-Downtime Deployment*).

### 5.3 Pruebas de Calidad (QA), Sandbox y Auditoría Lighthouse
* Pruebas de extremo a extremo (E2E) en entorno de pruebas (*Stripe Test Mode*) y validación de agentes de IA antes de pasar a llaves de producción (`pk_live_` / `sk_live_`).
* Auditoría automatizada con **Google Lighthouse** exigiendo puntuaciones superiores a **>90 puntos** en Rendimiento, Accesibilidad, Mejores Prácticas y SEO.

---

## Fase 6: Cierre del Proyecto, Monitoreo y Entregables Finales

Formalización de la entrega, transferencia de responsabilidad financiera y activación de telemetría.

### 6.1 Instrumentación y Monitoreo Post-Lanzamiento
* Rastreo de excepciones en tiempo real (**Sentry**) y monitor de disponibilidad (**Uptime Robot / BetterStack**).
* Verificación del primer ciclo exitoso de respaldos automáticos de base de datos.

### 6.2 Protocolo de Traspaso de Facturación o Activación de Póliza
* **Modalidad A (Entrega Total):** El cliente vincula sus propios métodos de pago en Vercel, Render, Google Cloud, AWS/Cloudflare y OpenAI; se transfieren los proyectos a su organización sin retención cautiva.
* **Modalidad B (Servicio Gestionado / Retainer):** La plataforma mantiene la administración técnica cobrando una iguala mensual que cubre monitoreo, respaldos, parches de seguridad y consumo base.

### 6.3 Checklist de Entregables Objetivos y Presupuesto Final
* Entrega de código fuente y accesos maestros (Repositorio, Hosting, CMS, Pasarela, Proveedores de IA).
* Manual de operación del sitio/CMS y diccionario de variables de entorno (`.env.example`).
* Conciliación del Presupuesto Final y firma del Acta de Entrega y Aceptación.
