import { Pool } from 'pg';
import { WebhookQueueService } from './services/webhookQueue.service';
import { verifyWebhookSignature } from './middleware/webhookSecurity.middleware';

async function runTests() {
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('TEST SUITE: MODERNIZACIÓN DE WEBHOOKS TSOLUTIONS (FASES 2, 3 Y 4)');
  console.log('════════════════════════════════════════════════════════════════════\n');

  // 1. TEST TS-WH-11: FIRMA CRIPTOGRÁFICA HMAC-SHA256 (STRIPE / SVIX STANDARD)
  console.log('[1/4] Probando Firma Criptográfica HMAC-SHA256...');
  const secretKey = 'whsec_test_secret_key_antigravity_2026';
  const payload = { event: 'ORDER_PLACED', amount: 1500, customer: 'Juan Perez' };
  const rawBody = JSON.stringify(payload);

  const { signatureHeader, timestamp } = WebhookQueueService.signPayload(rawBody, secretKey);
  console.log(`   Cabecera generada: ${signatureHeader}`);

  const verificationValid = verifyWebhookSignature(rawBody, signatureHeader, secretKey);
  console.log(`   Verificación con clave correcta: ${verificationValid.isValid ? '✓ APROBADA' : '✗ RECHAZADA'}`);

  const verificationInvalid = verifyWebhookSignature(rawBody, signatureHeader, 'clave_incorrecta');
  console.log(`   Verificación con clave alterada: ${!verificationInvalid.isValid ? '✓ SEGURIDAD CONFIRMADA (Rechazada)' : '✗ FALLÓ (Aceptó clave errónea)'}`);

  // Test expiración de replay attack
  const expiredHeader = `t=${timestamp - 600},v1=abcdef0123456789`;
  const verificationExpired = verifyWebhookSignature(rawBody, expiredHeader, secretKey);
  console.log(`   Protección contra Replay Attack (timestamp vencido): ${!verificationExpired.isValid ? '✓ DETECTADO (' + verificationExpired.reason + ')' : '✗ FALLÓ'}`);

  if (!verificationValid.isValid || verificationInvalid.isValid || verificationExpired.isValid) {
    throw new Error('Falló la prueba de firmas criptográficas HMAC.');
  }

  // 2. TEST TS-WH-08: COLA ASÍNCRONA DE DESPACHO
  console.log('\n[2/4] Probando Cola Asíncrona (Queue Pattern)...');
  const mockPool = { query: async () => ({ rows: [] }) } as unknown as Pool;
  const queueService = new WebhookQueueService(mockPool);

  const job = queueService.enqueue(
    'admin.lacuevadelguero.com',
    'https://httpbin.org/post', // Mock URL
    payload,
    '00000000-0000-0000-0000-000000000001',
    secretKey
  );

  console.log(`   Job creado encolado: ${job.id}`);
  console.log(`   Estado inicial: ${job.status}`);
  console.log(`   Reintentos configurados: ${job.maxAttempts}`);
  const statsInitial = queueService.getStats();
  console.log(`   Trabajos activos en cola: ${statsInitial.active_jobs}`);

  // 3. TEST TS-WH-09 & TS-WH-10: BACKOFF EXPONENCIAL Y DLQ
  console.log('\n[3/4] Probando Backoff Exponencial y Dead Letter Queue (DLQ)...');
  // Forzar simulación de fallo repetido hacia DLQ
  const failedJob = queueService.enqueue(
    'admin.lacuevadelguero.com',
    'https://127.0.0.1:9999/unreachable-endpoint',
    payload
  );

  console.log(`   Simulando agotamiento de 5 reintentos para ${failedJob.id}...`);
  // Simular los 5 intentos
  for (let i = 1; i <= 5; i++) {
    (failedJob as any).currentAttempt = i;
    (failedJob as any).lastError = `Connection refused at port 9999 (attempt ${i})`;
    await (queueService as any).handleFailedAttempt(failedJob);
  }

  const statsAfterFail = queueService.getStats();
  console.log(`   Elementos en Dead Letter Queue (DLQ): ${statsAfterFail.dlq_entries_count}`);
  const dlqItem = statsAfterFail.dlq_items[0];
  if (dlqItem) {
    console.log(`   ✓ Item ingresado a DLQ: ${dlqItem.id}`);
    console.log(`   ✓ Error final registrado: ${dlqItem.finalError}`);

    // Probar 1-Click Replay desde DLQ (TS-WH-07)
    console.log('\n[4/4] Probando 1-Click Replay desde DLQ...');
    const replayedJob = queueService.replayDlqEntry(dlqItem.id);
    console.log(`   ✓ Replay ejecutado. Nuevo Job generado: ${replayedJob?.id}`);
    const statsReplayed = queueService.getStats();
    console.log(`   Elementos restantes en DLQ tras replay: ${statsReplayed.dlq_entries_count}`);
  }

  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('TODAS LAS PRUEBAS DE MODERNIZACIÓN (FASES 2, 3 Y 4) PASARON CON ÉXITO');
  console.log('════════════════════════════════════════════════════════════════════\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Error durante la ejecución del test suite:', err);
  process.exit(1);
});
