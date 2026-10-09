import { log } from '../lib/pino';
import { replicationState } from '../services/replication-state';
import { gradeWorker, type WorkerGrade } from './health';
import { wsClient } from './websocket-client';

const HEALTH_PUSH_INTERVAL_MS = 15_000;

/** What the worker pushes to the API: its own grade, which the API passes on, and the generation of the books. */
export type HealthPush = WorkerGrade & { generation: number };

let timer: NodeJS.Timeout | null = null;

/**
 * Sends the worker's health now. The timer does it every 15 seconds; a new generation of the books and a connection
 * that just opened should not wait for it.
 */
export function pushHealth(): void {
  if (!wsClient.isConnected()) return;
  const payload: HealthPush = { ...gradeWorker(), generation: replicationState.generation };
  try {
    wsClient.send({ _control: 'health', payload });
  } catch (error) {
    // Called from a timer and from the socket's open event: a throw there would end the process.
    log.warn('Health push failed', { err: error });
  }
}

/** Starts the push of the worker's health to the API: every 15 seconds, and each time the socket opens. */
export function startHealthReporter(): void {
  if (timer) return;
  // Without this the API shows no report of a worker that just connected until the timer comes round.
  wsClient.onOpen = pushHealth;
  timer = setInterval(pushHealth, HEALTH_PUSH_INTERVAL_MS);
  timer.unref?.();
}

/** Ends the push at shutdown. */
export function stopHealthReporter(): void {
  wsClient.onOpen = null;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
