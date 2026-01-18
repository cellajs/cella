import { eq } from 'drizzle-orm';
import { db } from '#/db/db';
import { deploymentsTable } from '#/db/schema/deployments';
import { env } from '#/env';
import { logEvent } from '#/utils/logger';
import { processDeployment } from './deployment-service';

/**
 * Deployment worker configuration
 */
const WORKER_CONFIG = {
  /** How often to poll for pending deployments (ms) */
  pollInterval: env.DEPLOYMENT_WORKER_POLL_INTERVAL ?? 10_000,
  /** Maximum concurrent deployments to process */
  maxConcurrent: env.DEPLOYMENT_WORKER_MAX_CONCURRENT ?? 3,
  /** Whether the worker is enabled */
  enabled: env.DEPLOYMENT_WORKER_ENABLED ?? true,
};

/** Track running deployments to enforce concurrency limit */
const runningDeployments = new Set<string>();

/** Timer reference for cleanup */
let workerTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Check for pending deployments and process them
 */
async function processPendingDeployments(): Promise<void> {
  // Check if we can process more deployments
  if (runningDeployments.size >= WORKER_CONFIG.maxConcurrent) {
    logEvent('debug', 'Worker at max concurrency', {
      running: runningDeployments.size,
      max: WORKER_CONFIG.maxConcurrent,
    });
    return;
  }

  const slotsAvailable = WORKER_CONFIG.maxConcurrent - runningDeployments.size;

  // Fetch pending deployments
  const pendingDeployments = await db
    .select()
    .from(deploymentsTable)
    .where(eq(deploymentsTable.status, 'pending'))
    .limit(slotsAvailable);

  if (pendingDeployments.length === 0) {
    return;
  }

  logEvent('info', 'Processing pending deployments', {
    count: pendingDeployments.length,
    slotsAvailable,
  });

  // Process each deployment (non-blocking)
  for (const deployment of pendingDeployments) {
    // Skip if already running (race condition guard)
    if (runningDeployments.has(deployment.id)) continue;

    runningDeployments.add(deployment.id);

    // Process deployment in background
    processDeployment(deployment.id)
      .then(() => {
        logEvent('info', 'Deployment completed', { deploymentId: deployment.id });
      })
      .catch((error) => {
        logEvent('error', 'Deployment processing failed', {
          deploymentId: deployment.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      })
      .finally(() => {
        runningDeployments.delete(deployment.id);
      });
  }
}

/**
 * Start the deployment worker
 * Polls for pending deployments and processes them
 */
export function startDeploymentWorker(): void {
  if (!WORKER_CONFIG.enabled) {
    logEvent('info', 'Deployment worker disabled');
    return;
  }

  if (workerTimer) {
    logEvent('warn', 'Deployment worker already running');
    return;
  }

  logEvent('info', 'Starting deployment worker', {
    pollInterval: WORKER_CONFIG.pollInterval,
    maxConcurrent: WORKER_CONFIG.maxConcurrent,
  });

  // Initial run
  processPendingDeployments().catch((error) => {
    logEvent('error', 'Error in deployment worker', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  });

  // Schedule periodic checks
  workerTimer = setInterval(() => {
    processPendingDeployments().catch((error) => {
      logEvent('error', 'Error in deployment worker', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });
  }, WORKER_CONFIG.pollInterval);
}

/**
 * Stop the deployment worker
 */
export function stopDeploymentWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
    logEvent('info', 'Deployment worker stopped');
  }
}

/**
 * Get worker status
 */
export function getWorkerStatus(): {
  enabled: boolean;
  running: boolean;
  activeDeployments: number;
  maxConcurrent: number;
} {
  return {
    enabled: WORKER_CONFIG.enabled,
    running: workerTimer !== null,
    activeDeployments: runningDeployments.size,
    maxConcurrent: WORKER_CONFIG.maxConcurrent,
  };
}
