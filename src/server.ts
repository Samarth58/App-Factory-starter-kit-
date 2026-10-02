import { buildApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './db/connection.js';

// Shutdown ownership: server.ts owns app.close() and pool.end() during runtime process termination.
// Test runners (Vitest) manage their own pool teardown via globalSetup/setup.
let shuttingDown = false;

const app = buildApp();

async function gracefulShutdown(signal: string) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  app.log.info({ signal }, 'Graceful shutdown initiated');

  // Force exit if shutdown hangs beyond 10 seconds
  const forceExitTimer = setTimeout(() => {
    app.log.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10000);
  forceExitTimer.unref();

  try {
    await app.close();
    await pool.end();
    app.log.info('Graceful shutdown completed');
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'Error occurred during graceful shutdown');
    process.exit(1);
  }
}

process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  app.log.fatal({ err: reason }, 'Unhandled promise rejection');
  void gracefulShutdown('unhandledRejection');
});

process.on('uncaughtException', (err) => {
  app.log.fatal({ err }, 'Uncaught exception');
  void gracefulShutdown('uncaughtException');
});

await app.listen({ port: env.PORT, host: '0.0.0.0' });
