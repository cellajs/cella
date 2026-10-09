import type { Pgoutput } from 'pg-logical-replication';
import type { ChannelIdColumns } from 'shared';
import { isChannel } from 'shared';
import { RESOURCE_LIMITS } from '../constants';
import { suppressEmbeddingPropagation } from '../embeddings';
import { log } from '../lib/pino';
import type { ParseMessageResult } from '../pipeline/parse-message';
import type { PendingEvent } from '../types';
import { channelIdColumnKeys } from '../utils/channel-columns';
import { commitTimeMs } from '../utils/commit-time';
import { mergeDelta } from '../utils/compute-unified-deltas';
import { getCountDeltas } from '../utils/update-counts';
import { TransactionTooLargeError } from './failure';

/** Prefix of the counter keys that count rows: what a cascaded delete takes off the channels above it. */
const ENTITY_COUNT_PREFIX = 'e:c:';

/**
 * Buffers the changes of one source transaction and suppresses cascaded deletes as they arrive. Tracking
 * deleted channel ids bounds memory to surviving changes regardless of cascade size; changes outside
 * a transaction pass through directly. A transaction leaves the buffer whole, at its COMMIT, however
 * large it is or long it takes to arrive: a part of one is never emitted.
 *
 * A suppressed delete is no activity, and it still counted: its row leaves the counts of every channel above the one
 * that was deleted. Those counts are summed per channel as the deletes arrive and leave with the channel's own delete.
 */
export class TransactionBuffer {
  private activeXid: number | null = null;
  /**
   * When the transaction being buffered committed. Its activities take this as `createdAt`: the activities key is
   * (id, createdAt), so a change delivered twice has to carry the same time both times to be recorded once.
   */
  private commitTime: string | null = null;
  /** Commit position of the transaction being buffered: with a change's index it is the change's identity. */
  private commitLsn: string | null = null;
  private pendingEvents: PendingEvent[] = [];

  /** Channel entity IDs deleted in the current transaction (streaming suppression). */
  private deletedChannelIds = new Set<string>();

  /** Count of changes suppressed in the current transaction. */
  private suppressedCount = 0;

  /** What the suppressed deletes of the current transaction take off the row counts, per channel key. */
  private cascadeCounts = new Map<string, Record<string, number>>();

  private onSurvivingEvents: (events: PendingEvent[]) => Promise<void>;

  private maxEvents: number;

  constructor(
    onSurvivingEvents: (events: PendingEvent[]) => Promise<void>,
    { maxEvents = RESOURCE_LIMITS.buffers.maxTransactionEvents as number } = {},
  ) {
    this.onSurvivingEvents = onSurvivingEvents;
    this.maxEvents = maxEvents;
  }

  /**
   * Opens a source transaction.
   * @returns When it committed, in Unix milliseconds; null when its BEGIN carries no time.
   */
  onBegin(msg: Pgoutput.MessageBegin): number | null {
    // A stream sends BEGIN and COMMIT in pairs and every subscription starts with `reset`, so an open transaction
    // here is one whose COMMIT never came. It was not acknowledged: its changes go, and the slot delivers it again.
    if (this.activeXid !== null) {
      log.warn('BEGIN received while a transaction is open: dropping its events', {
        prevXid: this.activeXid,
        newXid: msg.xid,
        pendingCount: this.pendingEvents.length,
      });
    }

    this.reset();
    this.activeXid = msg.xid;
    const committedAt = commitTimeMs(msg);
    this.commitTime = committedAt === null ? null : new Date(committedAt).toISOString();
    this.commitLsn = msg.commitLsn;
    return committedAt;
  }

  /** Drops cascaded child deletes inline once the parent channel entity delete has been seen. */
  async onEvent(lsn: string, result: ParseMessageResult, index = 0): Promise<void> {
    if (this.activeXid === null) {
      await this.onSurvivingEvents([{ lsn, index, result }]);
      return;
    }

    const { activity } = result;
    if (this.commitTime) activity.createdAt = this.commitTime;

    if (activity.action === 'delete' && activity.entityType && isChannel(activity.entityType) && activity.subjectId) {
      this.deletedChannelIds.add(activity.subjectId);
    }

    if (this.isCascadedDelete(result)) {
      this.countCascadedDelete(result);
      this.suppressedCount++;
      return;
    }

    this.pendingEvents.push({ lsn, commitLsn: this.commitLsn, index, xid: this.activeXid, result });

    // The transaction is held whole until its commit: past the limit it would take the process's memory with it.
    if (this.pendingEvents.length > this.maxEvents) {
      const xid = this.activeXid;
      this.reset();
      throw new TransactionTooLargeError(this.maxEvents, xid);
    }
  }

  /** Emits the surviving buffered changes; a second pass catches child deletes that preceded their parent. */
  async onCommit(): Promise<void> {
    // Children that preceded their parent delete in WAL order; the parent-first case is already gone.
    const kept: PendingEvent[] = [];
    for (const event of this.pendingEvents) {
      if (this.isCascadedDelete(event.result)) this.countCascadedDelete(event.result);
      else kept.push(event);
    }
    const suppressedCount = this.suppressedCount + this.pendingEvents.length - kept.length;
    if (suppressedCount > 0) {
      log.info('Suppressed cascaded delete events', { suppressedCount, processedCount: kept.length, deletedChannelIds: [...this.deletedChannelIds] });
    }
    this.attachCascadeCounts(kept);
    this.reset();

    // Deletes of embedded product A plus updates of its host B: the B updates are cascade noise.
    const surviving = suppressEmbeddingPropagation(kept);
    if (surviving.length > 0) await this.onSurvivingEvents(surviving);
  }

  /** Whether a transaction is currently being buffered. */
  get isBuffering(): boolean {
    return this.activeXid !== null;
  }

  /** Forgets the transaction being buffered: the replication stream starts over and delivers it again. */
  reset(): void {
    this.activeXid = null;
    this.pendingEvents = [];
    this.deletedChannelIds.clear();
    this.suppressedCount = 0;
    this.cascadeCounts = new Map();
  }

  /** Sums what a suppressed delete takes off the row counts. The row is dropped; only numbers per channel are kept. */
  private countCascadedDelete({ tableMeta, activity, rowData, oldRowData }: ParseMessageResult): void {
    for (const { channelKey, deltas } of getCountDeltas(tableMeta, activity, rowData, oldRowData ?? null)) {
      const counts = Object.fromEntries(Object.entries(deltas).filter(([key]) => key.startsWith(ENTITY_COUNT_PREFIX)));
      if (Object.keys(counts).length > 0) mergeDelta(this.cascadeCounts, channelKey, counts);
    }
  }

  /**
   * Hands the summed counts to the first channel delete that survives: recorded with it, once. Counts on a channel
   * this transaction deleted are left out: its counter row is nobody's book any more.
   */
  private attachCascadeCounts(kept: PendingEvent[]): void {
    for (const channelId of this.deletedChannelIds) this.cascadeCounts.delete(channelId);
    if (this.cascadeCounts.size === 0) return;
    const carrier = kept.find(({ result: { activity } }) => activity.action === 'delete' && activity.entityType && isChannel(activity.entityType));
    if (carrier) carrier.cascadeCounts = this.cascadeCounts;
  }

  /** Whether a change is the delete of a row under a channel this transaction deleted, by the activity's channel id columns. */
  private isCascadedDelete({ activity }: ParseMessageResult): boolean {
    if (this.deletedChannelIds.size === 0 || activity.action !== 'delete') return false;

    // Never suppress the channel entity delete itself.
    if (activity.entityType && isChannel(activity.entityType)) return false;

    for (const idColumn of channelIdColumnKeys) {
      const value = (activity as Partial<ChannelIdColumns>)[idColumn];
      if (typeof value === 'string' && this.deletedChannelIds.has(value)) {
        return true;
      }
    }

    return false;
  }
}
