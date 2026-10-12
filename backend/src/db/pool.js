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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
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
    console.error('[DB] Connection failed:', err.message);
    return false;
  }
}

async function closePool() {
  await pool.end();
}

module.exports = { pool, query, getClient, transaction, testConnection, closePool };
