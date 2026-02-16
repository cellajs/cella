import { RESOURCE_LIMITS } from '../constants';
import { logEvent } from '../pino';
import { wsClient } from '../websocket-client';
import { replicationState } from './replication-state';
import { fmtBytes, getFreeDiskSpace, getWalBytes } from './resource-monitor';

const LOG_PREFIX = '[wal-guard]';
const { runtime, walGuard } = RESOURCE_LIMITS;

let pauseWarningInterval: NodeJS.Timeout | null = null;
let shutdownHandler: ((reason: string) => Promise<never>) | null = null;

/**
 * Set the shutdown handler function.
 * Must be called before starting the WAL guard.
 */
export function setShutdownHandler(handler: (reason: string) => Promise<never>): void {
  shutdownHandler = handler;
}

/**
 * Check if WAL or disk thresholds require emergency shutdown.
 * Returns shutdown reason if shutdown needed, null otherwise.
 */
async function checkShutdownConditions(): Promise<string | null> {
  const walBytes = await getWalBytes();
  const freeDiskBytes = getFreeDiskSpace();

  if (walBytes !== null && walBytes > runtime.walShutdownBytes) {
    return `Emergency shutdown: WAL accumulation exceeded ${fmtBytes(runtime.walShutdownBytes)} (current: ${fmtBytes(walBytes)})`;
  }

  if (freeDiskBytes !== null && freeDiskBytes < runtime.diskShutdownBytes) {
    return `Emergency shutdown: Free disk space below ${fmtBytes(runtime.diskShutdownBytes)} (available: ${fmtBytes(freeDiskBytes)})`;
  }

  return null;
}

/**
 * Check warning thresholds and log if exceeded.
 */
async function checkWarningConditions(pausedMs: number): Promise<void> {
  const walBytes = await getWalBytes();
  const freeDiskBytes = getFreeDiskSpace();

  if (walBytes !== null && walBytes > runtime.walWarningBytes) {
    logEvent('warn', `${LOG_PREFIX} WAL accumulation approaching limit`, {
      walBytes,
      warningWalBytes: runtime.walWarningBytes,
      maxWalBytes: runtime.walShutdownBytes,
      pausedSeconds: Math.round(pausedMs / 1000),
    });
  }

  if (freeDiskBytes !== null && freeDiskBytes < runtime.diskWarningBytes) {
    logEvent('warn', `${LOG_PREFIX} Free disk space running low`, {
      freeDiskBytes,
      warningFreeDiskBytes: runtime.diskWarningBytes,
      minFreeDiskBytes: runtime.diskUnhealthyBytes,
      pausedSeconds: Math.round(pausedMs / 1000),
    });
  }

  // Time-based warning as fallback
  if (pausedMs > runtime.pauseWarningMs) {
    logEvent('warn', `${LOG_PREFIX} Replication paused for extended period`, {
      pausedSeconds: Math.round(pausedMs / 1000),
      walBytes,
      freeDiskBytes,
    });
  }
}

/**
 * Start warning interval for WAL accumulation monitoring.
 * Triggers emergency shutdown if WAL size or disk space exceeds safe limits.
 */
export function startPauseWarningInterval(): void {
  if (pauseWarningInterval) return;

  pauseWarningInterval = setInterval(async () => {
    const pausedAt = replicationState.replicationPausedAt;
    if (!pausedAt) return;

    const pausedMs = Date.now() - pausedAt.getTime();

    // Check emergency shutdown conditions
    const shutdownReason = await checkShutdownConditions();
    if (shutdownReason) {
      logEvent('fatal', `${LOG_PREFIX} ${shutdownReason}`, {
        lastLsn: replicationState.lastLsn,
        pausedSeconds: Math.round(pausedMs / 1000),
      });
      if (shutdownHandler) {
        void shutdownHandler(shutdownReason);
      }
      return;
    }

    // Check warning thresholds
    await checkWarningConditions(pausedMs);
  }, walGuard.monitorIntervalMs);
}

/**
 * Stop warning interval.
 */
export function stopPauseWarningInterval(): void {
  if (pauseWarningInterval) {
    clearInterval(pauseWarningInterval);
    pauseWarningInterval = null;
  }
}

/**
 * Emergency shutdown handler.
 * Stops replication service, closes WebSocket, and exits process.
 * Called when WAL accumulation exceeds safe limits.
 */
export async function emergencyShutdown(reason: string): Promise<never> {
  logEvent('fatal', `${LOG_PREFIX} Initiating emergency shutdown...`, { reason });

  try {
    // Stop the warning interval first
    stopPauseWarningInterval();

    // Close WebSocket connection
    wsClient.close();

    // Stop replication service
    const service = replicationState.service;
    if (service) {
      await service.stop();
    }

    replicationState.markStopped();

    logEvent('fatal', `${LOG_PREFIX} Emergency shutdown complete`, { reason });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logEvent('error', `${LOG_PREFIX} Error during emergency shutdown`, { error: errorMessage });
  }

  // Exit with error code so orchestrator can restart with fresh state
  process.exit(1);
}
