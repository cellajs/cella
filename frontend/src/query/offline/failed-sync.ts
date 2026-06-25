/**
 * Client-side `failed_sync` quarantine (info/SCHEMA_EVOLUTION.md, 1.9).
 *
 * A migrated mutation that still fails replay with a 4xx is quarantined here
 * rather than dropped, so no offline edit is ever silently lost. Records are
 * surfaced in a non-blocking banner with JSON export (UI consumes `listFailedSync`).
 */
import { Dexie } from 'dexie';
import { appConfig } from 'shared';

export interface FailedSyncRecord {
  /** Auto-increment primary key. */
  id?: number;
  /** Mutation id (stx.mutationId) for idempotent manual replay. */
  mutationId: string;
  /** Product entity type, when known. */
  entityType?: string;
  /** Schema ordinal the client was on when the mutation failed. */
  clientSchemaVersion: number;
  /** HTTP status of the failed replay. */
  status: number;
  /** Serialized mutation variables (for export / manual repair). */
  variables: unknown;
  /** Error payload returned by the server, if any. */
  error?: unknown;
  /** Epoch ms when quarantined. */
  createdAt: number;
}

class FailedSyncDB extends Dexie {
  failedSync!: Dexie.Table<FailedSyncRecord, number>;

  constructor() {
    super(`${appConfig.slug}-failed-sync`);
    this.version(1).stores({ failedSync: '++id, mutationId, entityType, createdAt' });
  }
}

const db = new FailedSyncDB();

/** Quarantine a failed mutation. De-duplicates on `mutationId`. */
export async function quarantineFailedSync(record: Omit<FailedSyncRecord, 'id' | 'createdAt'>): Promise<void> {
  try {
    const existing = await db.failedSync.where('mutationId').equals(record.mutationId).first();
    if (existing) return;
    await db.failedSync.add({ ...record, createdAt: Date.now() });
  } catch (error) {
    console.error('[failed-sync] Failed to quarantine mutation:', error);
  }
}

/** List quarantined mutations, newest first. */
export async function listFailedSync(): Promise<FailedSyncRecord[]> {
  return db.failedSync.orderBy('createdAt').reverse().toArray();
}

/** Remove a quarantined record once manually replayed/repaired. */
export async function clearFailedSync(id: number): Promise<void> {
  await db.failedSync.delete(id);
}

/** Export all quarantined records as a JSON string for support/repair. */
export async function exportFailedSync(): Promise<string> {
  return JSON.stringify(await listFailedSync(), null, 2);
}
