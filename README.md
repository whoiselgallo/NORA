# Antigravity Instruction Architect & Workspace

Suite web interactiva y generador de directivas operativas lean con comandos `/`, menciones `@` y skills bajo demanda para el agente de IA Antigravity.

---

## ⚡ Características Principales

1. **Espacio de Trabajo para Ideas en Texto Plano**:
   - Redacción libre y sin restricciones de la visión, requerimientos, APIs, servicios o flujos del proyecto.
   - Plantillas preconfiguradas para SaaS con Stripe, E-commerce con captura de leads, y APIs RESTful con tareas en segundo plano.
   - Contador en vivo de palabras, caracteres y cobertura porcentual de fases.

2. **Motor de Detección Semántica & Auto-rellenado**:
   - Inferencia automática de módulos técnicos a partir de las palabras clave del usuario.
   - Pre-rellena las casillas del checklist identificando los puntos ya cubiertos (`⚡ Auto-detectado`).
   - Identifica y destaca visualmente los puntos faltantes de cada fase (`⏳ Falta por definir`) para que el desarrollador complete solo lo que falta.

3. **Checklist Interactivo por Fases de Desarrollo**:
   - **Fase 1: Definición & Arquitectura** (Modelado KPI, interfaces TypeScript OpenAPI, esquemas DB).
   - **Fase 2: Frontend & Maquetación UI** (Design tokens Tailwind, componentes atómicos, layouts responsive).
   - **Fase 3: Backend & Lógica de Servicios** (Endpoints REST, seguridad HMAC en Webhooks, colas Redis/BullMQ).
   - **Fase 4: Telemetría & Conversión de Leads** (DataLayer, captura de prospectos y CRM).
   - **Fase 5: QA, Rendimiento & Despliegue** (Auditoría Lighthouse >= 90, CI/CD con Docker y GitHub Actions).

4. **Generador de Directivas LEAN_PROMPT_V1**:
   - Compila la visión del proyecto, el enrutamiento de acciones `/action` -> `@mention`, el mapa de skills bajo demanda y las puertas de calidad.
   - Estimación de consumo de tokens en tiempo real y copiado con un clic.

---

## 🚀 Uso Rápido

Simplemente abre el archivo `index.html` en cualquier navegador web moderno:

```bash
# En Windows (PowerShell)
Start-Process "index.html"
```

No requiere dependencias externas ni compiladores; funciona 100% en el navegador (Vanilla HTML5, CSS3 y JavaScript moderno).

---

## 🛠️ Tecnologías

- **HTML5 & CSS3**: Variables CSS nativas, temas oscuros Cyberpunk / Sleek Terminal, CSS Grid & Flexbox responsivo.
- **JavaScript Moderno**: Inferencia y procesamiento de texto cliente-side, reactividad con debounce y API Clipboard.
- **Formato de Salida**: Específico para agentes Antigravity y LLMs orientados a desarrollo de software.
