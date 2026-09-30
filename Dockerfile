# ==============================================================================
# MULTI-STAGE DOCKERFILE DE ALTA EFICIENCIA
# Plataforma de Gestión de Proyectos, Telemetría y Workers BullMQ
# ==============================================================================

# ------------------------------------------------------------------------------
# FASE 1: BUILDER
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar herramientas esenciales de compilación nativa si son requeridas
RUN apk add --no-cache python3 make g++

# Copiar manifiestos de dependencias
COPY package*.json tsconfig*.json ./

# Instalación estricta y limpia de todas las dependencias (incluyendo devDependencies)
RUN npm ci

# Copiar código fuente
COPY server/ ./server/
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY public/ ./public/

# Compilar TypeScript hacia JavaScript en ./dist
RUN npm run build

# ------------------------------------------------------------------------------
# FASE 2: RUNNER (PRODUCCIÓN & SEGURIDAD)
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

# Definir variables de entorno de producción
ENV NODE_ENV=production
ENV PORT=8080

# Crear grupo y usuario sin privilegios root (UID 1001) para máxima seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001 -G nodejs

# Copiar manifiestos e instalar exclusivamente dependencias de producción
COPY package*.json ./
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Copiar binarios compilados y artefactos estáticos desde la fase builder
COPY --from=builder --chown=appuser:nodejs /app/dist ./dist
COPY --from=builder --chown=appuser:nodejs /app/public ./public
COPY --from=builder --chown=appuser:nodejs /app/scripts ./scripts

# Cambiar contexto al usuario seguro no-root
USER appuser

# Exponer el puerto de servicio HTTP / WebSockets / Cloud Run
EXPOSE 8080

# Healthcheck para monitorización de salud del contenedor
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/v1/workspaces || exit 1

# Comando de arranque del servidor unificado (Express, Socket.IO y Workers BullMQ)
CMD ["node", "dist/index.js"]
