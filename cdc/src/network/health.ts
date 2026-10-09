import process from 'node:process';
import { getEventLoopLagMs } from 'shared/utils/event-loop-monitor';
import { RESOURCE_LIMITS } from '../constants';
import { type MetricsSnapshot, metrics } from '../services/cdc-metrics';
import { type ReplicationFailure, replicationState } from '../services/replication-state';
import { type ReplicationStatus, replicationStatus } from '../services/replication-status';
import { wsClient } from './websocket-client';

const limits = RESOURCE_LIMITS.health;

/** What a person needs beside the grade, to see why the worker reports it. */
type WorkerHealthDetails = {
  replication: ReplicationStatus;
  lastAckedLsn: string | null;
  apiAwaySince: string | null;
  /** Whether Postgres reports the slot as read; null until the first poll of the slot. */
  slotActive: boolean | null;
  slotStatus: string | null;
  lagBytes: number | null;
  /** How long ago the source transaction read last committed; null before the first one. */
  lagMs: number | null;
  lastEventAt: string | null;
  /** The failure the worker is reading again from. */
  failure: ReplicationFailure | null;
  /** What the setup check found wrong: the worker does not read while this is not empty. */
  setupProblems: string[];
  messagesSent: number;
  eventLoopLagMs: number;
};

/** The worker's health as the worker itself grades it: the one grade the endpoint answers and the API is pushed. */
export interface WorkerGrade {
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Why the status is not healthy, one identifier per rule that holds; the rules that make it unhealthy come first. */
  reasons: string[];
  details: WorkerHealthDetails;
}

interface HealthResponse {
  status: WorkerGrade['status'];
  reasons: string[];
  uptime: number;
  eventLoopLagMs: number;
  replication: { status: ReplicationStatus } & Omit<WorkerHealthDetails, 'replication' | 'messagesSent' | 'eventLoopLagMs'>;
  websocket: { connected: boolean; state: string; messagesSent: number; lastMessageAt: string | null };
  metrics: MetricsSnapshot;
}

/** The reasons whose rule holds, in the order given. */
const holding = (rules: [holds: boolean, reason: string][]): string[] => rules.filter(([holds]) => holds).map(([, reason]) => reason);

/**
 * Grades the worker, for its own endpoint and for the push to the API alike, so the two never disagree. Unhealthy is
 * what needs a person or fails a deploy; degraded passes by itself: the API coming back, the next read, another worker
 * handing the slot over during a deploy.
 */
export function gradeWorker(): WorkerGrade {
  const { failure, stuck, setupProblems, subscribed } = replicationState;
  const { lagBytes, slotActive, slotStatus } = metrics;
  const apiAwayMs = wsClient.apiAwaySince ? Date.now() - wsClient.apiAwaySince.getTime() : null;
  const eventLoopLagMs = getEventLoopLagMs();

  const unhealthy = holding([
    [stuck, 'worker_stuck'],
    [setupProblems.length > 0, 'setup_problems'],
    // Without the API nothing is recorded: after a while that is an outage of sync, not a restart.
    [apiAwayMs !== null && apiAwayMs > limits.apiAwayUnhealthyMs, 'api_away'],
    // No progress for this long is a stall, also when every failure was one that passes.
    [failure !== null && Date.now() - Date.parse(failure.since) > limits.rereadUnhealthyMs, 'reading_again'],
    // The slot does not hold the WAL the worker needs any more, or is about to lose it.
    [slotStatus === 'lost' || slotStatus === 'unreserved', 'slot_lost'],
    [lagBytes !== null && lagBytes >= limits.walLagUnhealthyBytes, 'wal_lag_critical'],
    [eventLoopLagMs >= limits.eventLoopLagUnhealthyMs, 'event_loop_lag'],
  ]);

  const degraded = holding([
    [apiAwayMs !== null, 'api_away'],
    // Between two reads, and while another worker still holds the slot during a deploy.
    [!subscribed && apiAwayMs === null && setupProblems.length === 0, 'replication_stopped'],
    [failure !== null && !stuck, 'reading_again'],
    // Known only after the first poll of the slot: before it there is nothing to judge.
    [subscribed && slotStatus !== null && slotActive === false, 'slot_inactive'],
    [lagBytes !== null && lagBytes >= limits.walLagDegradedBytes && lagBytes < limits.walLagUnhealthyBytes, 'wal_lag_high'],
    [eventLoopLagMs >= limits.eventLoopLagDegradedMs, 'event_loop_lag'],
  ]);

  return {
    status: unhealthy.length > 0 ? 'unhealthy' : degraded.length > 0 ? 'degraded' : 'healthy',
    reasons: [...new Set([...unhealthy, ...degraded])],
    details: {
      replication: replicationStatus(),
      lastAckedLsn: replicationState.lastAckedLsn,
      apiAwaySince: wsClient.apiAwaySince?.toISOString() ?? null,
      slotActive,
      slotStatus,
      lagBytes,
      lagMs: replicationState.lagMs,
      lastEventAt: replicationState.lastEventAt?.toISOString() ?? null,
      failure,
      setupProblems,
      messagesSent: wsClient.messagesSent,
      eventLoopLagMs,
    },
  };
}

/** The body of `GET /health?depth=full`: the grade, with what only the endpoint shows. Answers 503 when unhealthy. */
export function getHealthResponse(): { response: HealthResponse; httpStatus: number } {
  const { status, reasons, details } = gradeWorker();
  const { replication, messagesSent, eventLoopLagMs, ...rest } = details;

  const response: HealthResponse = {
    status,
    reasons,
    uptime: Math.floor(process.uptime()),
    eventLoopLagMs,
    replication: { status: replication, ...rest },
    websocket: {
      connected: wsClient.isConnected(),
      state: wsClient.state,
      messagesSent,
      lastMessageAt: wsClient.lastMessageAt?.toISOString() ?? null,
    },
    metrics: metrics.getSnapshot(),
  };

  return { response, httpStatus: status === 'unhealthy' ? 503 : 200 };
}
