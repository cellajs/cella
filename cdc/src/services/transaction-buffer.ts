import type { Pgoutput } from 'pg-logical-replication';
import type { ChannelIdColumns } from 'shared';
import { appConfig, isChannel } from 'shared';
import { log } from '../lib/pino';
import type { ParseMessageResult } from '../pipeline/parse-message';
import type { PendingEvent } from '../types';
import { channelIdColumnKeys } from '../utils/channel-columns';
import { commitTimeMs } from '../utils/commit-time';

/** Reverse lookup: hostProduct to the products embedded into it. */
const embeddedByHostProduct = new Map<string, Set<string>>();
for (const { embeddedProduct, hostProduct } of appConfig.productEmbeddings) {
  const embedded = embeddedByHostProduct.get(hostProduct) ?? new Set<string>();
  embedded.add(embeddedProduct);
  embeddedByHostProduct.set(hostProduct, embedded);
}

/**
 * Buffers CDC events per transaction and suppresses cascaded deletes as they arrive. Tracking
 * deleted channel ids bounds memory to surviving events regardless of cascade size; events outside
 * a transaction pass through directly. A transaction leaves the buffer whole, at its COMMIT, however
 * large it is or long it takes to arrive: a part of one is never emitted.
 */
export class TransactionBuffer {
  private activeXid: number | null = null;
  /**
   * When the transaction being buffered committed. Its activities take this as `createdAt`: the activities key is
   * (id, createdAt), so an event delivered twice has to carry the same time both times to be recorded once.
   */
  private commitTime: string | null = null;
  /** Commit position of the transaction being buffered: with a change's index it is the change's identity. */
  private commitLsn: string | null = null;
  private pendingEvents: PendingEvent[] = [];

  /** Channel entity IDs deleted in the current transaction (streaming suppression). */
  private deletedChannelIds = new Set<string>();

  /** Count of events suppressed in the current transaction. */
  private suppressedCount = 0;

  private onSurvivingEvents: (events: PendingEvent[]) => Promise<void>;

  constructor(onSurvivingEvents: (events: PendingEvent[]) => Promise<void>) {
    this.onSurvivingEvents = onSurvivingEvents;
  }

  onBegin(msg: Pgoutput.MessageBegin): void {
    // A stream sends BEGIN and COMMIT in pairs and every subscription starts with `reset`, so an open transaction
    // here is one whose COMMIT never came. It was not acknowledged: its events go, and the slot delivers it again.
    if (this.activeXid !== null) {
      log.warn('BEGIN received while a transaction is open: dropping its events', {
        prevXid: this.activeXid,
        newXid: msg.xid,
        pendingCount: this.pendingEvents.length,
      });
    }

    this.activeXid = msg.xid;
    const committedAt = commitTimeMs(msg);
    this.commitTime = committedAt === null ? null : new Date(committedAt).toISOString();
    this.commitLsn = msg.commitLsn;
    this.pendingEvents = [];
    this.deletedChannelIds.clear();
    this.suppressedCount = 0;
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

    if (this.deletedChannelIds.size > 0 && this.isCascadedDelete(result)) {
      this.suppressedCount++;
      return;
    }

    this.pendingEvents.push({ lsn, commitLsn: this.commitLsn, index, xid: this.activeXid, result });
  }

  /** Emits the surviving buffered events; a second pass catches child deletes that preceded their parent. */
  async onCommit(): Promise<void> {
    let events = this.pendingEvents;
    let suppressedCount = this.suppressedCount;
    const deletedChannelIds = this.deletedChannelIds.size > 0 ? [...this.deletedChannelIds] : null;

    this.activeXid = null;
    this.pendingEvents = [];
    this.deletedChannelIds.clear();
    this.suppressedCount = 0;

    // Children that preceded their parent delete in WAL order; the parent-first case is already gone.
    if (deletedChannelIds && events.length > 1) {
      const deletedChannelSet = new Set(deletedChannelIds);
      const filtered: PendingEvent[] = [];
      for (const event of events) {
        if (this.isCascadedDeleteByIds(event.result, deletedChannelSet)) {
          suppressedCount++;
        } else {
          filtered.push(event);
        }
      }
      events = filtered;
    }

    if (suppressedCount > 0) {
      log.info('Suppressed cascaded delete events', { suppressedCount, processedCount: events.length, deletedChannelIds });
    }

    if (events.length === 0) return;

    if (events.length === 1) {
      await this.onSurvivingEvents(events);
      return;
    }

    let surviving = events;

    // Deletes of embedded product A plus updates of its host B: the B updates are cascade noise.
    if (surviving.length > 1 && embeddedByHostProduct.size > 0) {
      surviving = this.suppressSoftCascades(surviving);
    }

    if (surviving.length > 0) {
      if (surviving.length > 1) {
        const nonDeleteEvents = surviving.filter((e) => e.result.activity.action !== 'delete');
        const nonDeleteTypes = new Set(nonDeleteEvents.map((e) => e.result.tableMeta.type));
        if (nonDeleteTypes.size > 1) {
          log.warn('Transaction contains non-delete mutations across types', { types: [...nonDeleteTypes] });
        }
      }

      await this.onSurvivingEvents(surviving);
    }
  }

  /** Whether a transaction is currently being buffered. */
  get isBuffering(): boolean {
    return this.activeXid !== null;
  }

  /** Whether the transaction being buffered holds events that are not flushed yet. */
  get hasPendingEvents(): boolean {
    return this.pendingEvents.length > 0;
  }

  /** Forgets the transaction being buffered: the replication stream starts over and delivers it again. */
  reset(): void {
    this.activeXid = null;
    this.pendingEvents = [];
    this.deletedChannelIds.clear();
    this.suppressedCount = 0;
  }

  private isCascadedDelete(result: ParseMessageResult): boolean {
    return this.isCascadedDeleteByIds(result, this.deletedChannelIds);
  }

  /** Matches on the activity's channel entity id columns. */
  private isCascadedDeleteByIds(result: ParseMessageResult, deletedChannelIds: Set<string>): boolean {
    const { activity } = result;
    if (activity.action !== 'delete') return false;

    // Never suppress the channel entity delete itself.
    if (activity.entityType && isChannel(activity.entityType)) return false;

    for (const idColumn of channelIdColumnKeys) {
      const value = (activity as Partial<ChannelIdColumns>)[idColumn];
      if (typeof value === 'string' && deletedChannelIds.has(value)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Suppresses host-product updates that only propagate an embedded-product delete from the same
   * transaction; the client already applies these through propagateEmbeddings.
   */
  private suppressSoftCascades(events: PendingEvent[]): PendingEvent[] {
    const deleteTypes = new Set<string>();
    for (const e of events) {
      if (e.result.activity.action === 'delete' && e.result.activity.entityType) {
        deleteTypes.add(e.result.activity.entityType);
      }
    }

    if (deleteTypes.size === 0) return events;

    let softSuppressedCount = 0;
    const kept: PendingEvent[] = [];

    for (const event of events) {
      const { activity } = event.result;
      if (activity.action === 'update' && activity.entityType) {
        const embeddedTypes = embeddedByHostProduct.get(activity.entityType);
        if (embeddedTypes && [...embeddedTypes].some((s) => deleteTypes.has(s))) {
          softSuppressedCount++;
          continue;
        }
      }
      kept.push(event);
    }

    if (softSuppressedCount > 0) {
      log.info('Suppressed soft cascade update events', { softSuppressedCount, deleteTypes: [...deleteTypes], survivingCount: kept.length });
    }

    return kept;
  }
}
