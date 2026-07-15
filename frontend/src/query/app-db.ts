import type { DehydratedState } from '@tanstack/react-query';
import { Dexie } from 'dexie';
import { appConfig } from 'shared';
import type { AttachmentBlob, DownloadQueueEntry } from '~/modules/attachment/dexie/attachments-db';
import type { FailedSyncRecord } from '~/query/offline/failed-sync';

type DehydratedQuery = DehydratedState['queries'][number];

/** Generic key/value row backing migrated zustand stores (value = JSON string). */
export interface KvRecord {
  /** Store base name, e.g. `seen`, `sync`, `navigation`. */
  key: string;
  /** Serialized zustand state (createJSONStorage handles parse/stringify). */
  value: string;
}

/** Per-query React Query row for product entity queries, stored individually for incremental diffing. */
export interface PersistedQueryRecord {
  /** Compound key: `${scope}:${queryHash}`. */
  id: string;
  scope: string;
  queryHash: string;
  queryKey: DehydratedQuery['queryKey'];
  state: DehydratedQuery['state'];
  dataUpdatedAt: number;
}

/** React Query meta row, one per scope, bundling context queries, mutations, and cache-bust version. */
export interface PersistedMetaRecord {
  /** Scope key: `rq` (offline) or `s-<uuid>` (session). */
  key: string;
  timestamp: number;
  buster: string;
  /** Persisted client cache version (appConfig.clientCacheVersion). Mismatch wipes cached queries. */
  clientCacheVersion?: string;
  /** Persisted global lens schema ordinal. Values behind the bundle trigger boot migration. */
  schemaVersion?: number;
  mutations: DehydratedState['mutations'];
  /** Context queries bundled directly in meta. */
  channelQueries: DehydratedQuery[];
}

/**
 * Per-user Dexie database. All tables share one version ladder: bump the single
 * `version(n)` here and centralize schema changes (concurrent PRs must serialize).
 */
export class AppDatabase extends Dexie {
  kv!: Dexie.Table<KvRecord, string>;
  queries!: Dexie.Table<PersistedQueryRecord, string>;
  meta!: Dexie.Table<PersistedMetaRecord, string>;
  /** Attachment file blobs (uploads pending sync + cached downloads). */
  blobs!: Dexie.Table<AttachmentBlob, string>;
  /** Background download queue for offline attachment caching. */
  downloadQueue!: Dexie.Table<DownloadQueueEntry, string>;
  /** Quarantined mutations that exhausted retries (offline replay failures). */
  failedSync!: Dexie.Table<FailedSyncRecord, number>;

  constructor(ownerId: string) {
    super(`${appConfig.slug}:${ownerId}`);
    this.version(1).stores({
      kv: 'key',
      queries: 'id, scope',
      meta: 'key',
      blobs: '&id, attachmentId, organizationId, uploadStatus, [organizationId+source], [organizationId+uploadStatus]',
      downloadQueue: '&id, organizationId, [organizationId+status]',
      failedSync: '++id, mutationId, entityType, createdAt',
    });
  }
}

let currentDb: AppDatabase | null = null;
let currentOwnerId: string | null = null;

/** The currently bound per-user DB, or `null` while signed out. */
export function getAppDb(): AppDatabase | null {
  return currentDb;
}

/** Open (or reuse) the per-user DB for `ownerId`. Idempotent per owner; closes any prior owner. */
export function bindAppDb(ownerId: string): AppDatabase {
  if (currentDb && currentOwnerId === ownerId) return currentDb;
  if (currentDb) closeAppDb();
  currentDb = new AppDatabase(ownerId);
  currentOwnerId = ownerId;
  return currentDb;
}

/** Close and unbind the current per-user DB (sign-out / account switch). */
export function closeAppDb(): void {
  currentDb?.close();
  currentDb = null;
  currentOwnerId = null;
}

/** Permanently delete the current per-user DB for account removal. */
export async function deleteAppDb(): Promise<void> {
  const owner = currentOwnerId;
  closeAppDb();
  if (owner) await Dexie.delete(`${appConfig.slug}:${owner}`);
}
