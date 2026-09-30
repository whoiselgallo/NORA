const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

async function list() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const res = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
  );

  console.log("DB_TABLES_COUNT:", res.rows.length);
  console.log("DB_TABLES:", res.rows.map(r => r.table_name));
  await pool.end();
}

list().catch(console.error);
