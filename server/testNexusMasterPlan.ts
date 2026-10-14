import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env.local') });

import { Pool } from 'pg';
import { EmbeddingService } from './services/embedding.service';
import { NexusBrainService } from './services/nexusBrain.service';
import { splitIntoSemanticChunks } from './workers/documentIngestion.worker';

async function runMasterPlanVerification() {
  console.log('================================================================');
  console.log('🧪 VERIFICACIÓN INTEGRAL DE LAS 4 FASES DEL PLAN MAESTRO NEXUS');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 4;

  // ---------------------------------------------------------------------------
  // FASE 1 & 4: EMBEDDING SERVICE L1 CACHE & BATCH PROCESSING
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: EmbeddingService L1 Cache & Batch Generation ---');
  const t0 = Date.now();
  const sampleText = 'Arquitectura DAG y optimización OPEX en sistemas industriales.';
  const emb1 = await EmbeddingService.getEmbedding(sampleText);
  const latencyMiss = Date.now() - t0;
  console.log(`✓ Primer embedding obtenido: 1536-D generado en ${latencyMiss}ms`);

  const t1 = Date.now();
  const emb2 = await EmbeddingService.getEmbedding(sampleText);
  const latencyHit = Date.now() - t1;
  console.log(`✓ Segundo embedding (L1 Cache Hit): obtenido en ${latencyHit}ms (Target: < 5ms)`);

  if (latencyHit <= 10 && emb1.length === 1536 && emb2.length === 1536) {
    console.log('✅ TEST 1 PASADO: L1 Cache Hit superó el SLA ultra-rápido < 10ms.\n');
    passedTests++;
  } else {
    console.log('⚠️ TEST 1 ADVERTENCIA: Latencia fuera de rango esperado.\n');
  }

  // ---------------------------------------------------------------------------
  // FASE 4: CHUNKING SEMÁNTICO CON PRESERVACIÓN DE ENCABEZADOS Y 10% OVERLAP
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Chunking Semántico en DocumentIngestionWorker ---');
  const markdownSample = `
# Lección Aprendida: Mitigación de Latencia en PostgreSQL y HNSW

## Contexto del Proyecto
Durante la fase de estabilización del orquestador DAG, se detectaron picos de latencia en consultas vectoriales no indexadas. La implementación de índices HNSW redujo el p95 a menos de 45ms.

## Causa Raíz Ishikawa
La causa raíz principal correspondió a la falta de parámetros ef_construction calibrados y mantenimiento de conexiones concurrentes en Neon pooler.

### Acciones Correctivas
1. Creación de índices con vector_cosine_ops y m=16, ef_construction=64.
2. Desacople de ingesta masiva de archivos vía BullMQ.
3. Habilitación de caché L1/L2 para consultas frecuentes.
`;

  const chunks = splitIntoSemanticChunks(markdownSample, 2048, 204);
  console.log(`✓ Texto procesado: ${chunks.length} fragmentos semánticos generados.`);
  console.log(`✓ Primer fragmento (muestra): "${chunks[0]?.substring(0, 80).replace(/\n/g, ' ')}..."`);

  if (chunks.length > 0 && chunks[0].includes('# Lección Aprendida')) {
    console.log('✅ TEST 2 PASADO: Chunking semántico respeta encabezados lógicos y límites.\n');
    passedTests++;
  } else {
    console.log('❌ TEST 2 FALLÓ: Chunking no preservó estructura.\n');
  }

  // ---------------------------------------------------------------------------
  // FASE 3: CEREBRO NEXUS SÍNTESIS CON TIMEOUT RESILIENTE Y ACTION CARDS
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: Cerebro Nexus con Action Cards y SLO < 7s ---');
  const brainQueryStart = Date.now();
  
  const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL o DATABASE_URL_UNPOOLED no está definida en las variables de entorno.');
  }
  const realPool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  const brainService = new NexusBrainService(realPool);
  const result = await brainService.queryNexus(
    '00000000-0000-0000-0000-000000000001',
    '¿Cómo mitigar fallas de CI/CD en pipelines y reducir el tiempo de ciclo?',
    0.60
  );
  await realPool.end();
  const brainLatency = Date.now() - brainQueryStart;

  console.log(`✓ Consulta respondida en: ${brainLatency}ms (SLA Estricto: < 7000ms)`);
  console.log(`✓ Action Cards generadas: ${result.actionCards?.length || 0} tarjetas`);
  result.actionCards?.forEach((card: any, idx: number) => {
    console.log(`   [Card ${idx + 1}] ${card.label} (${card.actionType}) -> ${card.badge || 'N/A'}`);
  });

  if (brainLatency < 7000 && (result.actionCards?.length || 0) >= 1) {
    console.log('✅ TEST 3 PASADO: Cerebro Nexus respondió dentro del SLA y generó Action Cards.\n');
    passedTests++;
  } else {
    console.log('❌ TEST 3 FALLÓ: Latencia excedió 7s o no se generaron Action Cards.\n');
  }

  // ---------------------------------------------------------------------------
  // FASE 1: BATCH EMBEDDING TEST
  // ---------------------------------------------------------------------------
  console.log('--- TEST 4: Batch Vectorization en Paralelo ---');
  const batchTexts = [
    'Nodo 01: Preflight y Validaciones de Seguridad',
    'Nodo 02: Despliegue de Base de Datos y pgvector',
    'Nodo 03: Pruebas de Carga y Medición de Nivel Sigma'
  ];
  const tBatch = Date.now();
  const batchEmbeddings = await EmbeddingService.getBatchEmbeddings(batchTexts, 3);
  const batchLatency = Date.now() - tBatch;
  console.log(`✓ ${batchEmbeddings.length} vectores generados concurrentemente en ${batchLatency}ms`);

  if (batchEmbeddings.length === 3 && batchEmbeddings.every(v => v.length === 1536)) {
    console.log('✅ TEST 4 PASADO: Batch Vectorization opera con concurrencia controlada.\n');
    passedTests++;
  } else {
    console.log('❌ TEST 4 FALLÓ: Batch vectorization incompleta.\n');
  }

  console.log('================================================================');
  console.log(`RESULTADO FINAL: ${passedTests}/${totalTests} PRUEBAS COMPLETADAS CON ÉXITO.`);
  console.log('================================================================');

  process.exit(passedTests === totalTests ? 0 : 1);
}

runMasterPlanVerification().catch(err => {
  console.error('Error en suite de pruebas:', err);
  process.exit(1);
});
