const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

async function runTest() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  console.log('--- TEST: NEON AUTH & CRM LEAD NURTURING (vc.tsolutionsipidd.com) ---');

  // Verificar que la tabla users tiene las columnas
  const colRes = await pool.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name IN ('auth_provider', 'consent_privacy_at', 'company');
  `);
  console.log('Columnas presentes en users:', colRes.rows.map(r => r.column_name));

  // Simular inserción de usuario con cualquier dominio
  const testEmail = `lead.test.${Date.now()}@dominio-corporativo-libre.mx`;
  const insertRes = await pool.query(`
    INSERT INTO users (name, email, role, auth_provider, consent_privacy_at, consent_data_usage_at, company)
    VALUES ($1, $2, 'CLIENT', 'neon_oauth', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Pyme Mexicana S.A.')
    RETURNING id, name, email, role, auth_provider, consent_privacy_at;
  `, ['Lic. Carlos Fuentes', testEmail]);

  console.log('✓ Usuario registrado con dominio libre:', insertRes.rows[0]);

  // Limpiar usuario de prueba
  await pool.query(`DELETE FROM users WHERE email = $1`, [testEmail]);
  console.log('✓ Prueba completada y limpiada.');
  await pool.end();
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
