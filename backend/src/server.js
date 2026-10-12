/**
 * Campus Inn+ — Server Bootstrap Entrypoint
 */
const app = require('./app');
const config = require('./config');
const { testConnection, verifyRequiredTables } = require('./db/pool');
const { runMigration } = require('./db/migrate');

async function initializeDatabase() {
  console.log('[DB] Testing connection to PostgreSQL...');
  const connected = await testConnection();

  if (!connected) {
    const errorMsg = '[DB] PostgreSQL database is not reachable at configured DATABASE_URL.';
    if (config.isProduction()) {
      console.error(`[DB] Fatal: ${errorMsg} Startup halted in production mode.`);
      process.exit(1);
    } else {
      console.warn(`[DB] Warning: ${errorMsg} Continuing in offline/development mode.`);
      return false;
    }
  }

  // Database is available: run migrations and verify schema
  try {
    console.log('[DB] Checking and applying database migrations...');
    await runMigration();
    console.log('[DB] Database migration check completed.');

    // Verify required tables
    const verification = await verifyRequiredTables();
    if (verification.allPresent) {
      console.log(`[DB] Table verification passed: all required tables exist (${verification.existingCount} public tables).`);
    } else {
      console.warn(`[DB] Warning: Missing required tables: ${verification.missing.join(', ')}`);
    }
    return true;
  } catch (err) {
    console.error('[DB] Migration / schema initialization error:', err.message);
    if (config.isProduction()) {
      console.error('[DB] Fatal: Could not complete database initialization. Startup aborted.');
      process.exit(1);
    }
    return false;
  }
}

async function startServer() {
  console.log(`[Campus Inn+] Initializing backend server in ${config.env} mode...`);

  // Ensure initialization completes before listening on HTTP port
  const dbReady = await initializeDatabase();

  const server = app.listen(config.port, () => {
    console.log(`🚀 [Campus Inn+] Server listening on http://localhost:${config.port} (env: ${config.env}, db: ${dbReady ? 'connected' : 'offline'})`);
    console.log(`🌐 Serving frontend portals from frontend/ directory`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[Campus Inn+] Gracefully shutting down...');
    server.close(() => {
      console.log('[Campus Inn+] HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((err) => {
  console.error('[Campus Inn+] Fatal error during startup:', err.message || err);
  process.exit(1);
});

