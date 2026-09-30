import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const secret = process.env.GITHUB_WEBHOOK_SECRET || 'all_antigravity_secret_telemetry_2026';
const targetUrls = [
  'https://m.tsolutionsipidd.com/api/v1/telemetry/github',
  'https://mesa-de-trabajo-y-edicion.vercel.app/api/v1/telemetry/github'
];

function generateSignature(body: string, secretKey: string): string {
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(body);
  return `sha256=${hmac.digest('hex')}`;
}

async function testEndpoint(url: string) {
  console.log(`\n======================================================`);
  console.log(`Probando Webhook contra: ${url}`);
  console.log(`Secreto usado: ${secret}`);
  console.log(`======================================================`);

  // 1. TEST PING EVENT CON FIRMA VÁLIDA
  const pingPayload = JSON.stringify({
    zen: 'Mind your words, they are important.',
    hook_id: 12345678,
    repository: {
      full_name: 'whoiselgallo/antigravity-instruction-architect'
    }
  });

  const validPingSignature = generateSignature(pingPayload, secret);

  console.log('\n[1/3] Enviando evento PING con firma HMAC válida...');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'ping',
        'X-GitHub-Delivery': crypto.randomUUID(),
        'X-Hub-Signature-256': validPingSignature
      },
      body: pingPayload
    });

    const status = res.status;
    const text = await res.text();
    console.log(`   Resultado: HTTP ${status}`);
    console.log(`   Respuesta: ${text}`);

    if (status === 200) {
      console.log('   ✓ PING APROBADO EXITOSAMENTE');
    } else {
      console.log(`   ✗ Falló con código ${status}`);
    }
  } catch (err: any) {
    console.error(`   ✗ Error de red/conexión: ${err.message}`);
  }

  // 2. TEST WORKFLOW_RUN CON CONCLUSION SUCCESS
  const workflowPayload = JSON.stringify({
    action: 'completed',
    workflow_run: {
      id: 987654321,
      name: 'CI Build & Deploy',
      head_branch: 'main',
      head_sha: '5b918ba',
      conclusion: 'success',
      created_at: new Date(Date.now() - 35000).toISOString(),
      updated_at: new Date().toISOString()
    },
    repository: {
      full_name: 'whoiselgallo/antigravity-instruction-architect'
    }
  });

  const validWorkflowSig = generateSignature(workflowPayload, secret);

  console.log('\n[2/3] Enviando evento WORKFLOW_RUN (conclusion: success)...');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'workflow_run',
        'X-GitHub-Delivery': crypto.randomUUID(),
        'X-Hub-Signature-256': validWorkflowSig
      },
      body: workflowPayload
    });

    const status = res.status;
    const text = await res.text();
    console.log(`   Resultado: HTTP ${status}`);
    console.log(`   Respuesta: ${text}`);

    if (status === 200) {
      console.log('   ✓ WORKFLOW_RUN PROCESADO (Telemetría registrada y nodo GREEN)');
    }
  } catch (err: any) {
    console.error(`   ✗ Error de red/conexión: ${err.message}`);
  }

  // 3. TEST FIRMA INVÁLIDA (Seguridad: debe dar 401)
  console.log('\n[3/3] Probando seguridad con firma HMAC alterada...');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'push',
        'X-GitHub-Delivery': crypto.randomUUID(),
        'X-Hub-Signature-256': 'sha256=invalidsignature0000000000000000000000000000000000000000000000000'
      },
      body: pingPayload
    });

    const status = res.status;
    const text = await res.text();
    console.log(`   Resultado: HTTP ${status}`);
    console.log(`   Respuesta: ${text}`);

    if (status === 401) {
      console.log('   ✓ SEGURIDAD CONFIRMADA: Petición sin firma válida rechazada con 401.');
    } else {
      console.log(`   Advertencia: Código recibido ${status}`);
    }
  } catch (err: any) {
    console.error(`   ✗ Error de red: ${err.message}`);
  }
}

async function run() {
  for (const url of targetUrls) {
    await testEndpoint(url);
  }
}

run();
