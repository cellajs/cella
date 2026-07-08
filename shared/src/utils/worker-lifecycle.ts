export interface GracefulShutdownOptions {
  /** Service name for log messages. */
  name: string;
  /** Async cleanup function called on shutdown signals. */
  cleanup: () => Promise<void>;
  /** Log function for shutdown messages. */
  log: (msg: string) => void;
  /** Max time (ms) to wait for cleanup before force-exiting (default: 10000). */
  timeoutMs?: number;
}

/**
 * Shared graceful shutdown and crash handler for all services (api, cdc, yjs):
 * runs cleanup on SIGINT/SIGTERM, force-exiting if cleanup hangs or a second
 * signal arrives, and logs unhandledRejection/uncaughtException to stderr.
 */
export function setupGracefulShutdown(options: GracefulShutdownOptions): void {
  const { name, cleanup: cleanupFn, log: logFn, timeoutMs = 10_000 } = options;
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      logFn(`Second ${signal} received — forcing exit`);
      process.exit(1);
    }
    shuttingDown = true;
    logFn(`Received ${signal}, shutting down ${name}...`);

    const timer = setTimeout(() => {
      logFn(`Shutdown timed out after ${timeoutMs}ms — forcing exit`);
      process.exit(1);
    }, timeoutMs);
    timer.unref();

    try {
      await cleanupFn();
    } catch (err) {
      logFn(`Cleanup error: ${err instanceof Error ? err.message : err}`);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    process.stderr.write(`[${name}] Unhandled rejection: ${reason instanceof Error ? reason.stack : reason}\n`);
  });

  process.on('uncaughtException', (err) => {
    process.stderr.write(`[${name}] Uncaught exception: ${err.stack ?? err}\n`);
    setTimeout(() => process.exit(1), 500);
  });
}
