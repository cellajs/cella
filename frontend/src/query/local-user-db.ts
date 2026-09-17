import type { DehydratedState } from '@tanstack/react-query';
import { Dexie } from 'dexie';
import { appConfig } from 'shared';
import type { AttachmentBlob, DownloadQueueEntry } from '~/modules/attachment/offline/attachments-db';
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

let currentDb: LocalUserDatabase | null = null;
let currentOwnerId: string | null = null;

/** Listeners for a delete request from another tab (its hard sign-out), run after this tab closed and unbound the database. */
const deletedElsewhereListeners = new Set<() => void>();

/** Fires after another tab's delete closed and unbound the current database, so this tab can finish its own sign-out. */
export function subscribeLocalUserDbDeletedElsewhere(listener: () => void): () => void {
  deletedElsewhereListeners.add(listener);
  return () => deletedElsewhereListeners.delete(listener);
}

/** All tables share one version ladder: bump the single `version(n)` here, which means concurrent PRs changing it must serialize. */
export class LocalUserDatabase extends Dexie {
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

    // A delete from another connection is a hard sign-out in another tab: close for good and unbind, so a late write
    // here cannot recreate the database (Dexie's default handler keeps auto-open). Upgrades keep the default.
    this.on('versionchange', (event) => {
      if (event.newVersion !== null) return;
      this.close();
      if (currentDb !== this) return false;
      currentDb = null;
      currentOwnerId = null;
      for (const listener of deletedElsewhereListeners) listener();
      return false;
    });
  }
}

/** The currently bound per-user DB, or `null` while signed out. */
export function getLocalUserDb(): LocalUserDatabase | null {
  return currentDb;
}

/** Open (or reuse) the per-user DB for `ownerId`. Idempotent per owner; closes any prior owner. */
export function bindLocalUserDb(ownerId: string): LocalUserDatabase {
  if (currentDb && currentOwnerId === ownerId) return currentDb;
  if (currentDb) closeLocalUserDb();
  currentDb = new LocalUserDatabase(ownerId);
  currentOwnerId = ownerId;
  return currentDb;
}

/** Close and unbind the current per-user DB (sign-out / account switch). */
export function closeLocalUserDb(): void {
  currentDb?.close();
  currentDb = null;
  currentOwnerId = null;
}

/** Permanently delete the current per-user DB for account removal. */
export async function deleteLocalUserDb(): Promise<void> {
  const owner = currentOwnerId;
  closeLocalUserDb();
  if (owner) await Dexie.delete(`${appConfig.slug}:${owner}`);
}
