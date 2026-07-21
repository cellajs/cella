import type { Pgoutput } from 'pg-logical-replication';
import { isChannelEntity, appConfig } from 'shared';
import type { ChannelEntityIdColumns } from 'shared';
import type { ParseMessageResult } from '../pipeline/parse-message';
import type { PendingEvent } from '../types';
import { channelIdColumnKeys } from '../utils/channel-columns';
import { log } from '../lib/pino';
import { RESOURCE_LIMITS } from '../constants';

/** Reverse lookup: targetType → source types that embed into it (from productEmbeddings) */
const softCascadeTargets = new Map<string, Set<string>>();
for (const { embeddedProduct, hostProduct } of appConfig.productEmbeddings) {
  const sources = softCascadeTargets.get(hostProduct) ?? new Set<string>();
  sources.add(embeddedProduct);
  softCascadeTargets.set(hostProduct, sources);
}

const { transactionTimeoutMs } = RESOURCE_LIMITS.buffers;

/**
 * Transaction-aware buffer for CDC WAL events.
 *
 * Uses streaming cascade suppression: as DELETE events arrive, channel entity
 * IDs (organization, project, workspace) are tracked in a Set. Child deletes
 * referencing a tracked context ID are dropped inline, never buffered.
 *
 * This keeps memory bounded to surviving events only (channel entity deletes +
 * non-delete mutations), regardless of cascade size. A 100k-task org delete
 * buffers about 8 events while avoiding roughly 116k individual events.
 *
 * Single-event transactions (the common case) are passed through with no overhead.
 */
export class TransactionBuffer {
  private activeXid: number | null = null;
  private pendingEvents: PendingEvent[] = [];
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  /** Channel entity IDs deleted in the current transaction (streaming suppression). */
  private deletedChannelIds = new Set<string>();

  /** Count of events suppressed in the current transaction. */
  private suppressedCount = 0;

  /** Callback for surviving events after cascade analysis. */
  private onSurvivingEvents: (events: PendingEvent[]) => Promise<void>;

  constructor(
    onSurvivingEvents: (events: PendingEvent[]) => Promise<void>,
  ) {
    this.onSurvivingEvents = onSurvivingEvents;
  }

  /**
   * Handle a BEGIN message: start accumulating events for this transaction.
   */
  onBegin(msg: Pgoutput.MessageBegin): void {
    // If there's already an active transaction (shouldn't happen), flush it
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

  /**
   * Buffer a processed DML event. If no transaction is active, process immediately.
   * Cascaded child deletes are dropped inline via streaming suppression when the
   * parent channel entity delete has already been seen.
   */
  async onEvent(lsn: string, result: ParseMessageResult): Promise<void> {
    // No active transaction: emit immediately (passthrough)
    if (this.activeXid === null) {
      await this.onSurvivingEvents([{ lsn, result }]);
      return;
    }

    const { activity } = result;

    // Track channel entity deletes for streaming suppression
    if (activity.action === 'delete' && activity.entityType && isChannelEntity(activity.entityType) && activity.subjectId) {
      this.deletedChannelIds.add(activity.subjectId);
    }

    // Drop cascaded child deletes inline, never buffer them
    if (this.deletedChannelIds.size > 0 && this.isCascadedDelete(result)) {
      this.suppressedCount++;
      return;
    }

    this.pendingEvents.push({ lsn, result });
  }

  /**
   * Handle a COMMIT message: process surviving buffered events.
   * Most cascade suppression happens inline in onEvent(). A second pass catches
   * any child deletes that arrived before their parent channel entity delete.
   */
  async onCommit(): Promise<void> {
    this.clearTimeout();

    let events = this.pendingEvents;
    let suppressedCount = this.suppressedCount;
    const deletedChannelIds = this.deletedChannelIds.size > 0 ? [...this.deletedChannelIds] : null;

    this.activeXid = null;
    this.pendingEvents = [];
    this.deletedChannelIds.clear();
    this.suppressedCount = 0;

    // Second pass: catch child deletes that arrived before their parent channel entity
    // delete. Most children are dropped inline in onEvent(), but WAL order isn't always
    // parent-first (e.g., application-level batch deletes). This pass is cheap since only
    // surviving events remain (typically channel entity deletes + non-delete mutations).
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

    // Single-event transaction: no further analysis needed
    if (events.length === 1) {
      await this.onSurvivingEvents(events);
      return;
    }

    let surviving = events;

    // Soft cascade suppression: if tx contains DELETEs of source type A and UPDATEs of target type B,
    // and A→B is a known embedding relationship (productEmbeddings), suppress the B updates.
    if (surviving.length > 1 && softCascadeTargets.size > 0) {
      surviving = this.suppressSoftCascades(surviving);
    }

    // Emit surviving events to the flush buffer for cross-transaction batching
    if (surviving.length > 0) {
      // Mixed type validation: warn about cross-type non-delete mutations
      if (surviving.length > 1) {
        const nonDeleteTypes = new Set(
          surviving
            .filter((e) => e.result.activity.action !== 'delete')
            .map((e) => e.result.tableMeta.type),
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

  /**
   * Check if an event is a cascaded delete (inline check using instance state).
   * Used in onEvent() for streaming suppression.
   */
  private isCascadedDelete(result: ParseMessageResult): boolean {
    return this.isCascadedDeleteByIds(result, this.deletedChannelIds);
  }

  /**
   * Check if an event is a cascaded delete from a deleted channel entity, matched via the
   * activity's channel entity ID columns.
   */
  private isCascadedDeleteByIds(result: ParseMessageResult, deletedChannelIds: Set<string>): boolean {
    const { activity } = result;
    if (activity.action !== 'delete') return false;

    // Don't suppress the channel entity delete itself
    if (activity.entityType && isChannelEntity(activity.entityType)) return false;

    // Check all channel entity ID columns on this activity
    for (const idColumn of channelIdColumnKeys) {
      const value = (activity as Partial<ChannelEntityIdColumns>)[idColumn];
      if (typeof value === 'string' && deletedChannelIds.has(value)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Suppress embedding-propagation updates triggered by deletes in the same transaction.
   * Handles cases where a host entity array is updated synchronously alongside
   * an embedded entity delete (the client handles this via propagateEmbeddings); acts
   * as a generic safeguard against soft cascade duplication.
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
        const sourceTypes = softCascadeTargets.get(activity.entityType);
        if (sourceTypes && [...sourceTypes].some((s) => deleteTypes.has(s))) {
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

  /**
   * Flush all pending events without filtering (safety fallback).
   */
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
