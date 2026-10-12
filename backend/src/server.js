/**
 * Campus Inn+ — Server Bootstrap Entrypoint
 */
const app = require('./app');
const config = require('./config');
const { testConnection } = require('./db/pool');

async function startServer() {
  console.log(`[Campus Inn+] Initializing backend server in ${config.env} mode...`);

  // Test database connection in background (non-blocking)
  testConnection().then((connected) => {
    if (connected) {
      console.log('[DB] PostgreSQL database pool ready and connected.');
    } else {
      console.warn('[DB] PostgreSQL not reachable at configured DATABASE_URL. Running in degraded mode or using mocks.');
    }
  });

  const server = app.listen(config.port, () => {
    console.log(`🚀 [Campus Inn+] Production Server listening on http://localhost:${config.port}`);
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
  console.error('[Campus Inn+] Fatal error during startup:', err);
  process.exit(1);
});
