import type { Pgoutput } from 'pg-logical-replication';
import { isContextEntity, appConfig } from 'shared';
import type { ParseMessageResult } from '../pipeline/parse-message';
import type { PendingEvent } from '../types';
import { log } from '../lib/pino';
import { RESOURCE_LIMITS } from '../constants';

/** Reverse lookup: targetType → source types that embed into it (from entityEmbeddings) */
const softCascadeTargets = new Map<string, Set<string>>();
for (const { embeddedEntity, hostEntity } of appConfig.entityEmbeddings) {
  const sources = softCascadeTargets.get(hostEntity) ?? new Set<string>();
  sources.add(embeddedEntity);
  softCascadeTargets.set(hostEntity, sources);
}

const { transactionTimeoutMs } = RESOURCE_LIMITS.buffers;

/**
 * Transaction-aware buffer for CDC WAL events.
 *
 * Uses streaming cascade suppression: as DELETE events arrive, context entity
 * IDs (organization, project, workspace) are tracked in a Set. Child deletes
 * referencing a tracked context ID are dropped inline — never buffered.
 *
 * This keeps memory bounded to surviving events only (context entity deletes +
 * non-delete mutations), regardless of cascade size. A 100k-task org delete
 * buffers ~8 events instead of ~116k.
 *
 * Single-event transactions (the common case) are passed through with no overhead.
 */
export class TransactionBuffer {
  private activeXid: number | null = null;
  private pendingEvents: PendingEvent[] = [];
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  /** Context entity IDs deleted in the current transaction (streaming suppression). */
  private deletedContextIds = new Set<string>();

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
   * Handle a BEGIN message — start accumulating events for this transaction.
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
    this.deletedContextIds.clear();
    this.suppressedCount = 0;
    this.startTimeout();
  }

  /**
   * Buffer a processed DML event. If no transaction is active, process immediately.
   * Cascaded child deletes are dropped inline via streaming suppression when the
   * parent context entity delete has already been seen.
   */
  async onEvent(lsn: string, result: ParseMessageResult): Promise<void> {
    // No active transaction — emit immediately (passthrough)
    if (this.activeXid === null) {
      await this.onSurvivingEvents([{ lsn, result }]);
      return;
    }

    const { activity } = result;

    // Track context entity deletes for streaming suppression
    if (activity.action === 'delete' && activity.entityType && isContextEntity(activity.entityType) && activity.subjectId) {
      this.deletedContextIds.add(activity.subjectId);
    }

    // Drop cascaded child deletes inline — never buffer them
    if (this.deletedContextIds.size > 0 && this.isCascadedDelete(result)) {
      this.suppressedCount++;
      return;
    }

    this.pendingEvents.push({ lsn, result });
  }

  /**
   * Handle a COMMIT message — process surviving buffered events.
   * Most cascade suppression happens inline in onEvent(). A second pass catches
   * any child deletes that arrived before their parent context entity delete.
   */
  async onCommit(): Promise<void> {
    this.clearTimeout();

    let events = this.pendingEvents;
    let suppressedCount = this.suppressedCount;
    const deletedContextIds = this.deletedContextIds.size > 0 ? [...this.deletedContextIds] : null;

    this.activeXid = null;
    this.pendingEvents = [];
    this.deletedContextIds.clear();
    this.suppressedCount = 0;

    // Second pass: catch child deletes that arrived before their parent context entity delete.
    // Most children are dropped inline in onEvent(), but WAL order isn't always parent-first
    // (e.g., application-level batch deletes). This pass is cheap since only surviving events
    // remain (typically context entity deletes + non-delete mutations).
    if (deletedContextIds && events.length > 1) {
      const deletedSet = new Set(deletedContextIds);
      const filtered: PendingEvent[] = [];
      for (const event of events) {
        if (this.isCascadedDeleteByIds(event.result, deletedSet)) {
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
        deletedContextIds,
      });
    }

    if (events.length === 0) return;

    // Single-event transaction — no further analysis needed
    if (events.length === 1) {
      await this.onSurvivingEvents(events);
      return;
    }

    let surviving = events;

    // Soft cascade suppression: if tx contains DELETEs of source type A and UPDATEs of target type B,
    // and A→B is a known embedding relationship (entityEmbeddings), suppress the B updates.
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
    return this.isCascadedDeleteByIds(result, this.deletedContextIds);
  }

  /**
   * Check if an event is a cascaded delete from one of the deleted context entities.
   * Matches by checking if the event's context entity ID columns reference a deleted context.
   */
  private isCascadedDeleteByIds(result: ParseMessageResult, deletedContextIds: Set<string>): boolean {
    const { activity } = result;
    if (activity.action !== 'delete') return false;

    // Don't suppress the context entity delete itself
    if (activity.entityType && isContextEntity(activity.entityType)) return false;

    // Check all context entity ID columns on this activity
    for (const contextType of appConfig.contextEntityTypes) {
      const idColumn = appConfig.entityIdColumnKeys[contextType];
      const value = (activity as Record<string, unknown>)[idColumn];
      if (typeof value === 'string' && deletedContextIds.has(value)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Suppress embedding-propagation updates triggered by deletes in the same transaction.
   * Handles cases where a host entity array is updated synchronously alongside
   * an embedded entity delete (the client handles this via propagateEmbeddings).
   * Note: label cleanup is now async via CDC, but this remains as a generic safeguard.
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

/**
 * Extract the most specific context ID from an activity for batch grouping.
 * Checks context entity ID columns (e.g., projectId, organizationId).
 */
export function extractContextId(activity: ParseMessageResult['activity']): string | null {
  for (const contextType of appConfig.contextEntityTypes) {
    const idColumn = appConfig.entityIdColumnKeys[contextType];
    const value = (activity as Record<string, unknown>)[idColumn];
    if (typeof value === 'string') return value;
  }
  return null;
}
