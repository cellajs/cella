import type { Pgoutput } from 'pg-logical-replication';
import { isChannel } from 'shared';
import { entityCountPrefix } from '#/modules/entities/counter-keys';
import { resourceLimits } from '../constants';
import { log } from '../lib/pino';
import type { ParseMessageResult } from '../pipeline/parse-message';
import type { PendingEvent } from '../types';
import { channelIdColumnKeys } from '../utils/channel-columns';
import { commitTimeMs } from '../utils/commit-time';
import { mergeDelta } from '../utils/compute-unified-deltas';
import { getCountDeltas } from '../utils/count-deltas';

/** What a BEGIN tells of its source transaction, and so of each of its changes. */
interface OpenTransaction {
  xid: number;
  /** Commit position: with a change's index it is the change's identity. */
  commitLsn: string;
  /**
   * When it committed. Its activities take this as `createdAt`: the activities key is (id, createdAt), so a change
   * delivered twice has to carry the same time both times to be recorded once.
   */
  commitTime: string | null;
}

/**
 * Buffers the changes of one source transaction and suppresses cascaded deletes as they arrive. Tracking
 * deleted channel ids bounds memory to surviving changes regardless of cascade size. A transaction leaves the buffer
 * whole, at its COMMIT, however long it takes to arrive: a part of one is never emitted. Past `maxTransactionEvents`
 * kept changes `onEvent` throws, and so does a change outside a transaction, which the stream never sends.
 *
 * A suppressed delete is no activity, and it still counted: its row leaves the counts of every channel above the one
 * that was deleted. Those counts are summed per channel as the deletes arrive and leave with the channel's own delete.
 */
export class TransactionBuffer {
  /** The source transaction being buffered; null between two. */
  private transaction: OpenTransaction | null = null;
  /** Its kept changes, which take the end of its commit record at the COMMIT. */
  private pendingEvents: Omit<PendingEvent, 'commitEndLsn'>[] = [];

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
    { maxEvents = resourceLimits.buffers.maxTransactionEvents }: { maxEvents?: number } = {},
  ) {
    this.onSurvivingEvents = onSurvivingEvents;
    this.maxEvents = maxEvents;
  }

  /**
   * Opens a source transaction.
   * @returns When it committed, in Unix milliseconds; null when its BEGIN carries no time.
   */
  onBegin(msg: Pgoutput.MessageBegin): number | null {
    // The replication client reads position 0/0 as null, and no commit lies there.
    if (msg.commitLsn === null) throw new Error(`BEGIN of transaction ${msg.xid} carries no commit position`);
    const committedAt = commitTimeMs(msg);
    this.transaction = { xid: msg.xid, commitLsn: msg.commitLsn, commitTime: committedAt === null ? null : new Date(committedAt).toISOString() };
    return committedAt;
  }

  /** Drops cascaded child deletes inline once the parent channel entity delete has been seen. */
  async onEvent(lsn: string, result: ParseMessageResult, index: number): Promise<void> {
    const { transaction } = this;
    if (!transaction) throw new Error(`The change at ${lsn} arrived outside a transaction`);

    const { activity } = result;
    if (transaction.commitTime) activity.createdAt = transaction.commitTime;

    if (activity.action === 'delete' && activity.entityType && isChannel(activity.entityType) && activity.subjectId) {
      this.deletedChannelIds.add(activity.subjectId);
    }

    if (this.isCascadedDelete(result)) {
      this.countCascadedDelete(result);
      this.suppressedCount++;
      return;
    }

    this.pendingEvents.push({ lsn, commitLsn: transaction.commitLsn, index, xid: transaction.xid, result });

    // The transaction is held whole until its commit: past the limit it would take the process's memory with it.
    if (this.pendingEvents.length > this.maxEvents) {
      this.reset();
      throw new Error(
        `Transaction ${transaction.xid} holds more than ${this.maxEvents} changes: the worker buffers a transaction whole and stops here`,
      );
    }
  }

  /**
   * Emits the surviving buffered changes; a second pass catches child deletes that preceded their parent.
   * @param commitEndLsn - End of the commit record, from the COMMIT: the position a flush of these changes acknowledges.
   */
  async onCommit(commitEndLsn: string | null): Promise<void> {
    if (commitEndLsn === null) throw new Error('COMMIT carries no end position');
    // Children that preceded their parent delete in WAL order; the parent-first case is already gone.
    const kept: PendingEvent[] = [];
    for (const event of this.pendingEvents) {
      if (this.isCascadedDelete(event.result)) this.countCascadedDelete(event.result);
      else kept.push({ ...event, commitEndLsn });
    }
    const suppressedCount = this.suppressedCount + this.pendingEvents.length - kept.length;
    if (suppressedCount > 0) {
      log.info('Suppressed cascaded delete events', { suppressedCount, processedCount: kept.length, deletedChannelIds: [...this.deletedChannelIds] });
    }
    this.attachCascadeCounts(kept);
    this.reset();

    if (kept.length > 0) await this.onSurvivingEvents(kept);
  }

  /** Whether a transaction is currently being buffered. */
  get isBuffering(): boolean {
    return this.transaction !== null;
  }

  /** Forgets the transaction being buffered: the replication stream starts over and delivers it again. */
  reset(): void {
    this.transaction = null;
    this.pendingEvents = [];
    this.deletedChannelIds.clear();
    this.suppressedCount = 0;
    this.cascadeCounts = new Map();
  }

  /** Sums what a suppressed delete takes off the row counts. The row is dropped; only numbers per channel are kept. */
  private countCascadedDelete({ tableMeta, activity, rowData, oldRowData }: ParseMessageResult): void {
    for (const { channelKey, deltas } of getCountDeltas(tableMeta, activity, rowData, oldRowData ?? null)) {
      const counts = Object.fromEntries(Object.entries(deltas).filter(([key]) => key.startsWith(entityCountPrefix)));
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
      const value = activity[idColumn];
      if (typeof value === 'string' && this.deletedChannelIds.has(value)) {
        return true;
      }
    }

    return false;
  }
}
