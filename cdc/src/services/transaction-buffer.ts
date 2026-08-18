import type { Pgoutput } from 'pg-logical-replication';
import type { ChannelIdColumns } from 'shared';
import { appConfig, isChannel } from 'shared';
import { RESOURCE_LIMITS } from '../constants';
import { log } from '../lib/pino';
import type { ParseMessageResult } from '../pipeline/parse-message';
import type { PendingEvent } from '../types';
import { channelIdColumnKeys } from '../utils/channel-columns';

/** Reverse lookup: hostProduct to the products embedded into it. */
const embeddedByHostProduct = new Map<string, Set<string>>();
for (const { embeddedProduct, hostProduct } of appConfig.productEmbeddings) {
  const embedded = embeddedByHostProduct.get(hostProduct) ?? new Set<string>();
  embedded.add(embeddedProduct);
  embeddedByHostProduct.set(hostProduct, embedded);
}

const { transactionTimeoutMs } = RESOURCE_LIMITS.buffers;

/**
 * Buffers CDC events per transaction and suppresses cascaded deletes as they arrive. Tracking
 * deleted channel ids bounds memory to surviving events regardless of cascade size; events outside
 * a transaction pass through directly.
 */
export class TransactionBuffer {
  private activeXid: number | null = null;
  private pendingEvents: PendingEvent[] = [];
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  /** Channel entity IDs deleted in the current transaction (streaming suppression). */
  private deletedChannelIds = new Set<string>();

  /** Count of events suppressed in the current transaction. */
  private suppressedCount = 0;

  private onSurvivingEvents: (events: PendingEvent[]) => Promise<void>;

  constructor(onSurvivingEvents: (events: PendingEvent[]) => Promise<void>) {
    this.onSurvivingEvents = onSurvivingEvents;
  }

  onBegin(msg: Pgoutput.MessageBegin): void {
    // An active transaction here means a lost COMMIT: flush it before starting the new one.
    if (this.activeXid !== null) {
      log.warn('BEGIN received while transaction active, flushing previous', {
        prevXid: this.activeXid,
        newXid: msg.xid,
        pendingCount: this.pendingEvents.length,
      });
      this.flushAll();
    }

    this.activeXid = msg.xid;
    this.pendingEvents = [];
    this.deletedChannelIds.clear();
    this.suppressedCount = 0;
    this.startTimeout();
  }

  /** Drops cascaded child deletes inline once the parent channel entity delete has been seen. */
  async onEvent(lsn: string, result: ParseMessageResult): Promise<void> {
    if (this.activeXid === null) {
      await this.onSurvivingEvents([{ lsn, result }]);
      return;
    }

    const { activity } = result;

    if (activity.action === 'delete' && activity.entityType && isChannel(activity.entityType) && activity.subjectId) {
      this.deletedChannelIds.add(activity.subjectId);
    }

    if (this.deletedChannelIds.size > 0 && this.isCascadedDelete(result)) {
      this.suppressedCount++;
      return;
    }

    this.pendingEvents.push({ lsn, result });
  }

  /** Emits the surviving buffered events; a second pass catches child deletes that preceded their parent. */
  async onCommit(): Promise<void> {
    this.clearTimeout();

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
      log.info('Suppressed cascaded delete events', {
        suppressedCount,
        processedCount: events.length,
        deletedChannelIds,
      });
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
        const nonDeleteTypes = new Set(
          surviving.filter((e) => e.result.activity.action !== 'delete').map((e) => e.result.tableMeta.type),
        );
        if (nonDeleteTypes.size > 1) {
          log.warn('Transaction contains non-delete mutations across types', {
            types: [...nonDeleteTypes],
          });
        }
      }

      await this.onSurvivingEvents(surviving);
    }
  }

  /** Whether a transaction is currently being buffered. */
  get isBuffering(): boolean {
    return this.activeXid !== null;
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
      log.info('Suppressed soft cascade update events', {
        softSuppressedCount,
        deleteTypes: [...deleteTypes],
        survivingCount: kept.length,
      });
    }

    return kept;
  }

  /** Fallback: emits every pending event without cascade filtering. */
  private async flushAll(): Promise<void> {
    this.clearTimeout();
    const events = this.pendingEvents;
    this.activeXid = null;
    this.pendingEvents = [];

    if (events.length > 0) {
      await this.onSurvivingEvents(events);
    }
  }

  private startTimeout(): void {
    this.clearTimeout();
    this.timeoutHandle = setTimeout(() => {
      if (this.activeXid !== null) {
        log.warn('Transaction buffer timeout, flushing without filtering', {
          xid: this.activeXid,
          count: this.pendingEvents.length,
        });
        this.flushAll();
      }
    }, transactionTimeoutMs);
  }

  private clearTimeout(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }
}
