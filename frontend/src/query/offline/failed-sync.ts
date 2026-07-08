import { reportCriticalError } from '~/lib/tracing';
import { getAppDb } from '~/query/app-db';

/** Client-side `failed_sync` quarantine row for failed offline mutation replay. */
export interface FailedSyncRecord {
  /** Auto-increment primary key. */
  id?: number;
  /** Mutation id (stx.mutationId) for idempotent manual replay. */
  mutationId: string;
  /** Product entity type, when known. */
  entityType?: string;
  /** Client cache version (appConfig.clientCacheVersion) the client was on when it failed. */
  clientCacheVersion: string;
  /** HTTP status of the failed replay. */
  status: number;
  /** Serialized mutation variables (for export / manual repair). */
  variables: unknown;
  /** Error payload returned by the server, if any. */
  error?: unknown;
  /** Epoch ms when quarantined. */
  createdAt: number;
}

/** Quarantine a failed mutation. De-duplicates on `mutationId`. No-ops while signed out. */
export async function quarantineFailedSync(record: Omit<FailedSyncRecord, 'id' | 'createdAt'>): Promise<void> {
  const db = getAppDb();
  if (!db) return;
  try {
    const existing = await db.failedSync.where('mutationId').equals(record.mutationId).first();
    if (existing) return;
    await db.failedSync.add({ ...record, createdAt: Date.now() });
  } catch (error) {
    console.error('[failed-sync] Failed to quarantine mutation:', error);
    reportCriticalError('offline.quarantine_failed', error, { mutationId: record.mutationId });
  }
}

/** List quarantined mutations, newest first. Empty while signed out. */
export async function listFailedSync(): Promise<FailedSyncRecord[]> {
  const db = getAppDb();
  if (!db) return [];
  return db.failedSync.orderBy('createdAt').reverse().toArray();
}

/** Remove a quarantined record once manually replayed/repaired. */
export async function clearFailedSync(id: number): Promise<void> {
  await getAppDb()?.failedSync.delete(id);
}

/** Export all quarantined records as a JSON string for support/repair. */
export async function exportFailedSync(): Promise<string> {
  return JSON.stringify(await listFailedSync(), null, 2);
}
