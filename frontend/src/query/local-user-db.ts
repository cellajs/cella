import type { DehydratedState } from '@tanstack/react-query';
import { Dexie } from 'dexie';
import { appConfig, type ProductEntityType } from 'shared';
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

/** A collaborative document's key in the Yjs tables: its entity. */
export interface YDocKey {
  entityType: ProductEntityType;
  entityId: string;
}

/** A stored document's metadata. Its state lives apart, so eviction, the byte budget and the sign-out list read no state. */
export interface YDocRecord extends YDocKey {
  tenantId: string;
  organizationId: string;
  /** The document's generation as the relay announced it; another one means the server reseeded the document. */
  generation: string;
  /** The server's state vector as the last proof established it; null before the first. */
  syncedVector: Uint8Array | null;
  /** 1 while a `local` row is left: an edit no server answer has proven saved. */
  unsynced: 0 | 1;
  /** Base plus update rows, for the byte budget. */
  bytes: number;
  /** The update rows' share of `bytes`; past a threshold, a trim folds them into the base. */
  updateBytes: number;
  updatedAt: number;
  lastOpenedAt: number;
}

/** A stored document's base: every update the last trim folded. */
export interface YDocStateRecord extends YDocKey {
  state: Uint8Array;
}

/** One update appended after the base. A `local` row holds an edit no server answer has proven saved yet. */
export interface YDocUpdateRecord extends YDocKey {
  id?: number;
  update: Uint8Array;
  local: 0 | 1;
  /** The page load that wrote the row; its own clean proof clears it. */
  tabId: string;
}

/** Why edits can never be saved: the entity was deleted, edit rights were lost, the server reseeded the document, or it refused it. */
export type UnsaveableReason = 'deleted' | 'denied' | 'replaced' | 'refused';

/** Edits that can never be saved, kept until the user copies or discards them. */
export interface UnsaveableYDocRecord extends YDocKey {
  id?: number;
  tenantId: string;
  organizationId: string;
  generation: string;
  reason: UnsaveableReason;
  state: Uint8Array;
  at: number;
}

let currentDb: LocalUserDatabase | null = null;
let currentOwnerId: string | null = null;

/** Listeners for a delete from another tab (its hard sign-out), run after this tab closed and unbound the database. */
export const deletedElsewhereListeners = new Set<() => void>();

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
  /** Collaborative documents opened for editing: metadata only, so a scan over all of them loads no state. */
  yDocs!: Dexie.Table<YDocRecord, [ProductEntityType, string]>;
  /** Each stored document's base state. */
  yDocStates!: Dexie.Table<YDocStateRecord, [ProductEntityType, string]>;
  /** Append-only update log per stored document, one `add` per row so tabs never overwrite each other's rows. */
  yDocUpdates!: Dexie.Table<YDocUpdateRecord, number>;
  /** Edits that can never be saved, kept until the user copies or discards them; never evicted. */
  unsaveableYDocs!: Dexie.Table<UnsaveableYDocRecord, number>;

  constructor(ownerId: string) {
    super(`${appConfig.slug}:${ownerId}`);
    // A database still on version 1 upgrades in place: Dexie adds the missing tables and keeps every row.
    this.version(2).stores({
      kv: 'key',
      queries: 'id, scope',
      meta: 'key',
      blobs: '&id, attachmentId, organizationId, uploadStatus, [organizationId+source], [organizationId+uploadStatus]',
      downloadQueue: '&id, organizationId, [organizationId+status]',
      failedSync: '++id, mutationId, entityType, createdAt',
      yDocs: '[entityType+entityId], lastOpenedAt',
      yDocStates: '[entityType+entityId]',
      yDocUpdates: '++id, [entityType+entityId]',
      unsaveableYDocs: '++id, [entityType+entityId]',
    });

    // A delete from another connection is a hard sign-out in another tab: close for good and unbind, so a late write
    // here cannot recreate the database (Dexie's default handler keeps auto-open). Upgrades keep the default: a tab on
    // an older version closes so another tab's upgrade can run, and its next query reopens on the newer version.
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
