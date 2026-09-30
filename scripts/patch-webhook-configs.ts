import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../.env.local') });
import { Pool } from 'pg';

async function patch() {
  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await pool.query(`
      ALTER TABLE projects ALTER COLUMN github_repo DROP NOT NULL;
    `);
    console.log('github_repo made nullable in projects');
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

patch();
