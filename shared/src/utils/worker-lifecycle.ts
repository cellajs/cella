import process from 'node:process';

export interface GracefulShutdownOptions {
  /** Service name for log messages. */
  name: string;
  /** Runs once, on the first SIGINT or SIGTERM. */
  cleanup: () => Promise<void>;
  log: (msg: string) => void;
  /** How long cleanup may run before the process force-exits. */
  timeoutMs?: number;
}

/**
 * Shutdown and crash handling for api, cdc and yjs: runs cleanup on SIGINT/SIGTERM, force-exits
 * when cleanup hangs or a second signal arrives, and logs unhandledRejection and
 * uncaughtException to stderr.
 */
export function setupGracefulShutdown(options: GracefulShutdownOptions): void {
  const { name, cleanup: cleanupFn, log: logFn, timeoutMs = 10_000 } = options;
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      logFn(`Second ${signal} received: forcing exit`);
      process.exit(1);
    }
    shuttingDown = true;
    logFn(`Received ${signal}, shutting down ${name}...`);

    const timer = setTimeout(() => {
      logFn(`Shutdown timed out after ${timeoutMs}ms: forcing exit`);
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
