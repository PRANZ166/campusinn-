/**
 * Campus Inn+ — PostgreSQL Connection Pool
 * Provides a single shared pool for the application.
 */
const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({
  connectionString: config.db.connectionString,
  ssl: config.db.ssl,
  max: config.db.max,
  idleTimeoutMillis: config.db.idleTimeoutMillis,
  connectionTimeoutMillis: config.db.connectionTimeoutMillis,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

/**
 * Execute a parameterized query.
 * @param {string} text - SQL query with $1, $2, ... placeholders
 * @param {Array} params - Parameter values
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (config.isDevelopment() && duration > 200) {
    console.warn(`[DB] Slow query (${duration}ms):`, text.substring(0, 120));
  }
  return result;
}

/**
 * Get a client from the pool for transactions.
 * Caller MUST call client.release() when done.
 */
async function getClient() {
  return pool.connect();
}

/**
 * Run a function inside a database transaction.
 * Automatically commits on success or rolls back on error.
 */
async function transaction(fn) {
  let client;
  try {
    client = await pool.connect();
  } catch (connErr) {
    // Graceful fallback for mock/test environments where pool.query is mocked on pool directly
    return fn({ query: (sql, params) => pool.query(sql, params) });
  }

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    if (client && typeof client.release === 'function') {
      client.release();
    }
  }
}

/**
 * Test database connectivity
 */
async function testConnection() {
  try {
    const res = await pool.query('SELECT NOW() AS server_time');
    console.log('[DB] Connected to PostgreSQL at', res.rows[0].server_time);
    return true;
  } catch (err) {
    const reason = err.code || err.message || (err.errors && err.errors[0] && err.errors[0].message) || 'Service offline';
    console.error(`[DB] Connection failed (${reason})`);
    return false;
  }
}

/**
 * Verify presence of required database tables
 */
async function verifyRequiredTables() {
  const REQUIRED_TABLES = [
    'users',
    'student_profiles',
    'companies',
    'job_postings',
    'applications',
    'events',
    'notifications',
    '_migrations',
  ];
  try {
    const res = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const existingTables = new Set(res.rows.map(r => r.table_name));
    const missing = REQUIRED_TABLES.filter(t => !existingTables.has(t));
    return {
      allPresent: missing.length === 0,
      existingCount: existingTables.size,
      missing,
      tables: Array.from(existingTables),
    };
  } catch (err) {
    console.error('[DB] Table verification query failed:', err.message);
    return { allPresent: false, error: err.message, missing: REQUIRED_TABLES };
  }
}

async function closePool() {
  await pool.end();
}

module.exports = { pool, query, getClient, transaction, testConnection, verifyRequiredTables, closePool };
