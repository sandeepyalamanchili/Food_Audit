require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'auditor' CHECK (role IN ('admin','auditor')),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS restaurants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS branches (
        id TEXT PRIMARY KEY,
        restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        address TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS branches_restaurant_id_idx ON branches(restaurant_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dishes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        sop TEXT,
        ref_image TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dish_embeddings (
        id TEXT PRIMARY KEY,
        dish_id TEXT NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
        embedding JSONB NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('reference','audit')),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS dish_embeddings_dish_id_idx ON dish_embeddings(dish_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS audits (
        id TEXT PRIMARY KEY,
        dish_id TEXT REFERENCES dishes(id) ON DELETE SET NULL,
        dish_name TEXT NOT NULL,
        restaurant_id TEXT REFERENCES restaurants(id) ON DELETE SET NULL,
        branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
        restaurant_name TEXT,
        branch_name TEXT,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        user_name TEXT,
        photo TEXT NOT NULL,
        criteria JSONB NOT NULL DEFAULT '[]',
        total_score NUMERIC NOT NULL,
        max_total NUMERIC NOT NULL,
        overall_comment TEXT,
        verdict TEXT NOT NULL CHECK (verdict IN ('Pass','Needs Review','Fail')),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Backfill for databases created by earlier versions of this app
    await client.query(`ALTER TABLE audits ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE audits ADD COLUMN IF NOT EXISTS user_name TEXT`);

    await client.query(`CREATE INDEX IF NOT EXISTS audits_dish_id_idx ON audits(dish_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS audits_created_at_idx ON audits(created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS audits_verdict_idx ON audits(verdict)`);
    await client.query(`CREATE INDEX IF NOT EXISTS audits_restaurant_id_idx ON audits(restaurant_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS audits_branch_id_idx ON audits(branch_id)`);

    await client.query('COMMIT');
    console.log('✅ Migration complete');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
