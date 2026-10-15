# Flujo de Preguntas y Lógica Condicional (Árbol de Decisiones)
## Onboarding Técnico, Presupuestación Dinámica & Blueprint de Ingeniería

> **TSolutions IPIDD** • *“Tecnología instalada. Conocimiento transferido. Negocios escalados.”*  
> El formulario de onboarding se divide en **6 pasos progresivos**. Varias preguntas solo aparecen si el cliente activa una condición previa (*branching logic*), evitando abrumarlo con opciones irrelevantes.

---

## 1. Los 6 Pasos Progresivos con Lógica Condicional

### Paso 1: Naturaleza del Proyecto y Tráfico (Define Hosting Base)
* **Pregunta 1.1: ¿Cuál es el objetivo principal de tu sitio o plataforma web?**
  * **Opción A: Presencia informativa, página de aterrizaje (Landing Page) para captar prospectos o portafolio corporativo.**
    * *Acción del Sistema:* Activa Opción A (Sitio Estático) $\rightarrow$ Asigna Fila 2 = 1 (Vercel Hobby / Cloudflare Pages, 4 hrs, $0 OpEx). Oculta preguntas de bases de datos complejas.
  * **Opción B: Sistema empresarial a medida, portal con procesamiento en servidor tradicional, o integración con sistemas existentes en PHP / APIs dedicadas.**
    * *Acción del Sistema:* Activa Opción B (Backend PHP/API) $\rightarrow$ Asigna Fila 2 = 1 (Frontend) + Fila 4 = 1 (Render Standard / Google Cloud Run, 10 hrs, $25/mes OpEx).
  * **Opción C: Aplicación web moderna interactiva (SaaS, plataforma de miembros, marketplace o herramienta con Inteligencia Artificial integrada).**
    * *Acción del Sistema:* Activa Opción C (Full-Stack SSR / Microservicios) $\rightarrow$ Evalúa tráfico en P1.2 para decidir entre Vercel Hobby (Fila 2) o Vercel Pro (Fila 3, $20/mes) + Backend en Render (Fila 4, $25/mes).
* **Pregunta 1.2: ¿Qué volumen de visitas mensuales estimas recibir en los primeros 6 meses?**
  * **Menos de 10,000 visitas/mes (Uso inicial / lanzamiento):** $\rightarrow$ Mantiene Fila 2 = 1 ($0 OpEx).
  * **Más de 10,000 visitas/mes o uso comercial intensivo:** $\rightarrow$ Cambia a Fila 3 = 1 (Vercel Pro, 6 hrs, $20/mes OpEx).

---

### Paso 2: Datos, Archivos y Autogestión de Contenido (Define Persistencia y CMS)
* **Pregunta 2.1: ¿Tu sitio necesita guardar información dinámica (registros de clientes, pedidos, historial, catálogos dinámicos)?** *(Se marca "Sí" automáticamente si eligió Opción B o C en P1.1)*
  * **No:** Solo enviará formularios de contacto a mi correo o WhatsApp $\rightarrow$ Fila 5 = 0 (Sin base de datos).
  * **Sí:** Necesito almacenar y consultar información en tiempo real $\rightarrow$ Activa Fila 5 = 1 (Supabase / Neon / Render PostgreSQL + Snapshots diarios de respaldo, 8 hrs, $25/mes OpEx).
* **Pregunta 2.2: ¿Los usuarios o administradores subirán archivos pesados como fotos de perfil, documentos PDF, comprobantes o videos?**
  * **Sí:** $\rightarrow$ Activa Fila 6 = 1 (Object Storage: AWS S3 / Cloudflare R2 / Cloudinary, 5 hrs, $5/mes OpEx).
  * **No:** $\rightarrow$ Fila 6 = 0.
* **Pregunta 2.3: ¿Deseas un panel autoadministrable para cambiar textos, publicar en un blog o editar productos por tu cuenta sin pedir soporte técnico?**
  * **Sí:** $\rightarrow$ Activa Fila 7 = 1 (Headless CMS: Sanity / Strapi / Payload, 14 hrs, $15/mes OpEx).
  * **No:** $\rightarrow$ Fila 7 = 0.

---

### Paso 3: Cuentas de Usuario y Niveles de Acceso (Define Auth & RBAC)
* **Pregunta 3.1: ¿Tus clientes o empleados necesitarán iniciar sesión con usuario y contraseña (o con Google/Redes Sociales)?**
  * **Sí, con diferentes permisos:** (ej. Vista de Administrador, Vista de Cliente Pagado, Vista de Usuario Gratuito y verificación en 2 pasos) $\rightarrow$ Activa Fila 8 = 1 (Clerk / Supabase Auth / Auth.js con RBAC y 2FA, 12 hrs, $0 OpEx hasta 10k usuarios).
  * **No, el sitio es de acceso público:** $\rightarrow$ Fila 8 = 0.

---

### Paso 4: Monetización y Pasarela de Pagos (Define Stripe y Variables Financieras)
* **Pregunta 4.1: ¿Vas a cobrar en línea dentro de la plataforma?**
  * **No:** $\rightarrow$ Fila 9 = 0, Celda B21 = 0, Celda B22 = 0.
  * **Sí, pagos únicos:** (carrito de compras, servicios, infoproductos) $\rightarrow$ Activa Fila 9 = 1 (Stripe Checkout / PaymentIntents + Webhooks Idempotentes, 20 hrs).
  * **Sí, suscripciones recurrentes o membresías:** $\rightarrow$ Activa Fila 9 = 1 (Stripe Billing + Webhooks Idempotentes, 20 hrs).
* **Pregunta 4.2 (Condicional si P4.1 = Sí): Para proyectar tus comisiones financieras: ¿Cuál es tu meta mensual de ventas en dólares (USD) y cuántos pagos individuales estimas recibir al mes?**
  * **Input Numérico 1:** Volumen mensual estimado ($ USD) $\rightarrow$ Se inyecta en Celda B21 (Calcula 3.6%).
  * **Input Numérico 2:** Cantidad de transacciones al mes (# pagos) $\rightarrow$ Se inyecta en Celda B22 (Calcula comisión fija por transacción).

---

### Paso 5: Inteligencia Artificial y Procesamiento en Segundo Plano (Define IA y Colas)
* **Pregunta 5.1: ¿El proyecto integrará funciones de Inteligencia Artificial (chatbots de atención, generación de textos/imágenes, análisis de documentos o recomendaciones)?**
  * **No:** $\rightarrow$ Fila 10 = 0, Fila 11 = 0, Celda B23 = 0.
  * **Sí:** $\rightarrow$ Activa Fila 10 = 1 (API Gemini / OpenAI / Anthropic + Middleware Rate Limiting en Upstash Redis + Hard Limit mensual, 24 hrs, $30/mes OpEx base).
* **Pregunta 5.2 (Condicional si P5.1 = Sí o si hay procesos pesados): ¿La plataforma realizará tareas que tomen más de 10 segundos en completarse (ej. generar reportes extensos con IA, analizar archivos PDF grandes, procesar video o enviar correos masivos)?**
  * **Sí:** $\rightarrow$ Activa Fila 11 = 1 (Colas Asíncronas: Inngest / Trigger.dev / BullMQ, 16 hrs, $10/mes OpEx) para evitar cortes por HTTP Timeout en Vercel/Render.
  * **No, solo respuestas rápidas e instantáneas:** $\rightarrow$ Fila 11 = 0.
* **Pregunta 5.3 (Condicional si P5.1 = Sí): ¿Cuántas consultas o interacciones con la IA estimas que harán tus usuarios en total cada mes?**
  * **Input Numérico:** Número de peticiones mensuales (ej. 10,000) $\rightarrow$ Se inyecta en Celda B23.

---

### Paso 6: Operación Post-Lanzamiento (Define Modalidad de Cierre)
* **Pregunta 6.1: Una vez entregada tu plataforma en producción, ¿cómo prefieres gestionar su mantenimiento, seguridad y pago de servidores?**
  * **Modalidad A (Autogestión / Entrega Total):** Deseo vincular mis propias tarjetas bancarias en cada proveedor (Vercel, Render, OpenAI) y hacerme cargo de las actualizaciones técnicas.
  * **Modalidad B (Servicio Gestionado / Póliza Retainer):** Prefiero pagar una iguala mensual fija para que su equipo administre los servidores, monitoree caídas 24/7 (Sentry/Uptime), verifique respaldos diarios y aplique parches de seguridad (Snyk).

*(Nota de Blindaje: Los módulos de Correo Transaccional + DNS [Fila 12], Diseño UI/UX [Fila 13], SEO Técnico y Analítica [Fila 14], Cumplimiento Legal [Fila 15], Seguridad DevSecOps/Snyk [Fila 16] y Monitoreo Sentry/Uptime [Fila 17] se activan con valor 1 por defecto en todos los proyectos como estándar de calidad irrenunciable).*

---

## 2. Matriz de Conexión Automática: Cuestionario $\rightarrow$ Cotizador (Fase 3) $\rightarrow$ Blueprint (Fase 4)

| ID Pregunta | Condición Elegida por el Cliente | Celda en Cotizador (Fase 3) | Impacto en Blueprint (Fase 4) |
| :--- | :--- | :--- | :--- |
| **P1.1 + P1.2** | Opción A (Estático) + <10k visitas | D2 = 1, D3 = 0, D4 = 0 | Stack: Astro/Next.js Estático en Vercel Hobby + CDN. |
| **P1.1 + P1.2** | Opción C (SSR/SaaS) + >10k visitas | D2 = 0, D3 = 1, D4 = 1 | Stack Híbrido: Frontend en Vercel Pro + Backend en Render. |
| **P1.1** | Opción B (PHP / API Tradicional) | D2 = 1, D4 = 1 | Stack: PHP 8.x (Laravel) con Dockerfile en Render / Cloud Run. |
| **P2.1** | Sí requiere guardar datos dinámicos | D5 = 1 (+8 hrs, +$25 OpEx) | Aprovisiona Supabase / Neon SQL + Cron de Snapshots diarios. |
| **P2.2** | Sí requiere subida de archivos/media | D6 = 1 (+5 hrs, +$5 OpEx) | Agrega SDK de Cloudflare R2 / AWS S3 y variables S3_SECRET. |
| **P2.3** | Sí requiere autogestión (CMS) | D7 = 1 (+14 hrs, +$15 OpEx) | Integra estudio de Sanity / Strapi / Payload CMS. |
| **P3.1** | Sí requiere login y roles de usuario | D8 = 1 (+12 hrs, $0 OpEx) | Configura Clerk / Auth.js, middleware RBAC y 2FA. |
| **P4.1 + P4.2** | Sí cobra en línea (Stripe) | D9 = 1, B21 = $, B22 = # | Crea `/api/webhooks/stripe` con validación `whsec_` e idempotencia. |
| **P5.1 + P5.3** | Sí integra Inteligencia Artificial | D10 = 1, B23 = # peticiones | Agrega `/lib/ai`, Upstash Redis Rate Limit y alerta de Hard Limit. |
| **P5.2** | Sí ejecuta tareas largas (>10 seg) | D11 = 1 (+16 hrs, +$10 OpEx) | Configura carpeta `/jobs` con workers de Inngest / Trigger.dev. |
| **Estándar Fijo** | Obligatorio en todo proyecto | D12:D17 = 1 (43 hrs base) | Activa Resend (SPF/DKIM), UI, SEO/GA4, Legal, Snyk y Sentry. |

---

## 3. Estructura de Datos (JSON Schema) para Programar el Onboarding

```json
{
  "project_onboarding_state": {
    "client_info": {
      "name": "Gabriel Ayala",
      "company": "MPS Ayala Ferretodo",
      "email": "gabriel@ferreayala.mx"
    },
    "step_1_architecture": {
      "project_type": "fullstack_ssr",
      "expected_monthly_traffic": "under_10k",
      "preferred_backend_language": "node_ts"
    },
    "step_2_data_and_content": {
      "needs_database": true,
      "needs_file_storage": true,
      "needs_headless_cms": false
    },
    "step_3_identity": {
      "needs_authentication": true,
      "roles_required": ["admin", "subscribed_client", "guest"],
      "require_2fa": true
    },
    "step_4_payments_stripe": {
      "enable_stripe": true,
      "payment_model": "subscriptions_and_one_time",
      "estimated_monthly_volume_usd": 5000,
      "estimated_monthly_transactions": 100
    },
    "step_5_ai_and_queues": {
      "enable_ai": true,
      "ai_provider": "gemini",
      "estimated_monthly_ai_requests": 10000,
      "monthly_hard_limit_usd": 30,
      "needs_async_queues": false
    },
    "step_6_handover_modality": {
      "management_mode": "modality_b_retainer"
    },
    "mandatory_standards": {
      "transactional_email_dns": true,
      "ui_ux_design": true,
      "technical_seo_analytics": true,
      "legal_compliance_pages": true,
      "devsecops_snyk_ci_cd": true,
      "sentry_uptime_monitoring": true
    }
  }
}
```
