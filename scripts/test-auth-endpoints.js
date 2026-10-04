const http = require('http');
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { createAuthRouter } = require('../dist/routes/auth.routes');

async function testAuthRoutes() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(pool));

  const server = app.listen(0);
  const port = server.address().port;
  console.log(`Test auth server listening on port ${port}`);

  async function request(path, options = {}) {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  }

  try {
    // 1. Legal Notice Endpoint
    const legalRes = await request('/api/v1/auth/legal');
    console.log('1. Legal Notice:', legalRes.status === 200 ? '✓ PASS' : '❌ FAIL', legalRes.data.entity);

    // 2. Signup WITHOUT legal consent -> Must fail with 400
    const failRes = await request('/api/v1/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@externo.org',
        name: 'Usuario Prueba',
        consent_privacy: false
      })
    });
    console.log('2. Reject without consent:', failRes.status === 400 && failRes.data.error.includes('LEGAL_CONSENT_REQUIRED') ? '✓ PASS (400 Reclamado)' : '❌ FAIL');

    // 3. Signup WITH consent and ANY domain
    const testEmail = `lead.oauth.${Date.now()}@mi-empresa-abierta.com.mx`;
    const signupRes = await request('/api/v1/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        email: testEmail,
        name: 'Ing. Rodrigo Paz',
        company: 'Logística Total S.A.',
        role: 'CLIENT',
        consent_privacy: true,
        consent_data_usage: true,
        provider: 'neon_oauth'
      })
    });
    console.log('3. Signup with open domain & consent:', signupRes.status === 201 && signupRes.data.token ? '✓ PASS (201 Token Emitido)' : '❌ FAIL', signupRes.data);

    // 4. Login existing user
    const loginRes = await request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: testEmail,
        consent_privacy: true,
        consent_data_usage: true
      })
    });
    console.log('4. Login existing user:', loginRes.status === 200 && loginRes.data.token ? '✓ PASS (200 Token Emitido)' : '❌ FAIL');

    // 5. Neon OAuth Callback
    const oauthRes = await request('/api/v1/auth/neon-oauth', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'google',
        email: `oauth.${Date.now()}@gmail.com`,
        name: 'Google User',
        consent_privacy: true,
        consent_data_usage: true
      })
    });
    console.log('5. OAuth callback provider:', oauthRes.status === 200 && oauthRes.data.token ? '✓ PASS (200 OAuth OK)' : '❌ FAIL');

    // Limpieza
    await pool.query('DELETE FROM users WHERE email LIKE $1 OR email LIKE $2', [`%${testEmail}%`, '%oauth.%@gmail.com']);
    console.log('✓ Limpieza completada.');
  } finally {
    server.close();
    await pool.end();
  }
}

testAuthRoutes().catch(err => {
  console.error('Error in auth test:', err);
  process.exit(1);
});
