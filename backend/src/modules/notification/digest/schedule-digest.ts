import { log } from '#/utils/logger';
import { runDigest } from './run-digest';

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Hourly in-process scheduler for {@link runDigest}, gated by the caller to the migration-owning
 * instance so exactly one process runs it (the same guard `scheduleDbMaintenance` uses).
 *
 * Hourly because the run decides per user whether their digest is due: an hourly tick with a
 * stored watermark survives restarts and deploys, while a fixed-time cron silently loses a day
 * whenever the process is down at that minute.
 *
 * Failures are logged and absorbed. Returns a stop function that clears the timers.
 */
export function scheduleNotificationDigest(intervalMs: number = ONE_HOUR_MS): () => void {
  const run = () => {
    runDigest().catch((error) => {
      log.error('Digest scheduled run failed', { err: error });
    });
  };

  // Defer the first run so it never competes with boot-time migrations.
  const startTimer = setTimeout(run, Math.min(intervalMs, 5 * 60 * 1000));
  const interval = setInterval(run, intervalMs);
  if (typeof interval.unref === 'function') interval.unref();
  if (typeof startTimer.unref === 'function') startTimer.unref();

  return () => {
    clearTimeout(startTimer);
    clearInterval(interval);
  };
}
