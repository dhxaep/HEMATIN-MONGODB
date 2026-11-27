require('dotenv').config();
const app = require('./src/app');
const { connectDB, disconnectDB } = require('./src/config/db');

const PORT = Number(process.env.PORT) || 5000;
let server;
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(JSON.stringify({ level: 'info', event: 'shutdown_start', signal, timestamp: new Date().toISOString() }));

  const forceTimer = setTimeout(() => {
    console.error(JSON.stringify({ level: 'error', event: 'shutdown_forced_timeout' }));
    process.exit(1);
  }, 10000);
  forceTimer.unref();

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
    console.log(JSON.stringify({ level: 'info', event: 'shutdown_complete' }));
    process.exit(0);
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'shutdown_error', message: error.message }));
    process.exit(1);
  }
}

async function startServer() {
  try {
    await connectDB();
    server = app.listen(PORT, () => {
      console.log(`[Server] Hematin REST API v2.1.0 berjalan di http://localhost:${PORT}`);
      console.log(`[Server] Health Check : http://localhost:${PORT}/api/health`);
      console.log(`[Server] Swagger Docs : http://localhost:${PORT}/api/docs`);
      console.log(`[Server] Analytics    : http://localhost:${PORT}/api/analytics/summary`);
    });

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  } catch (error) {
    console.error('[Server] Gagal memulai server:', error.message);
    process.exit(1);
  }
}

startServer();
