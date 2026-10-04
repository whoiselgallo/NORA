const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

async function patch() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const query = `
    ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(50) DEFAULT 'neon_oauth';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_privacy_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_data_usage_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS company VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);

    CREATE TABLE IF NOT EXISTS audit_events_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID,
      user_id UUID,
      action VARCHAR(100) NOT NULL,
      resource_type VARCHAR(100),
      resource_id TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_audit_events_workspace ON audit_events_log(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events_log(action);
  `;

  await pool.query(query);
  console.log('✓ Users columns for Neon OAuth and Legal Consent verified/added successfully');
  await pool.end();
}

patch().catch(err => {
  console.error(err);
  process.exit(1);
});
