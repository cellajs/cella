/**
 * Stores collaborative documents opened for editing in the per-user database, so they load before the provider
 * connects and stay editable offline. Every function here is a stub with its final signature: the store is built on
 * the release 3 branch, and until then nothing is stored or loaded.
 */

import type * as Y from 'yjs';
import type { UnsaveableReason, YDocKey, YDocRecord } from '~/query/local-user-db';

/** The longest a load may hold up the provider's connect. */
export const STORE_LOAD_TIMEOUT_MS = 5_000;
/** A document's update rows are trimmed into its base past this many rows, or past `TRIM_BYTES`. */
export const TRIM_ROWS = 100;
export const TRIM_BYTES = 256 * 1024;
/** Eviction removes the least recently opened documents past this many, or past `MAX_STORED_BYTES` in all. */
export const MAX_STORED_DOCS = 200;
export const MAX_STORED_BYTES = 50 * 1024 * 1024;
/** Eviction leaves a document opened within this window alone: another tab may hold it open. */
export const EVICT_MIN_AGE_MS = 60 * 60_000;

/** The update rows a connection's document holds: every row up to `upTo` as its load read them, plus `ids` since. */
export interface AppliedRows {
  /** The newest row id the load read; 0 when nothing was loaded. */
  upTo: number;
  /** Rows past `upTo` the document holds: this tab's own, and those other tabs sent. */
  ids: Set<number>;
}

/** A stored document as its load reads it: the metadata, its base and update rows in order, and the newest row id. */
export interface LoadedYDoc {
  record: YDocRecord;
  updates: Uint8Array[];
  appliedUpTo: number;
}

/** A document whose edits no server holds: stored with unsynced edits, or parked as unsaveable. */
export interface UnsavedYDoc extends YDocKey {
  tenantId: string;
  organizationId: string;
  /** Why the edits can never be saved, once parked; null while they are stored and wait for a server. */
  parked: UnsaveableReason | null;
}

/** The proof that the server holds a document's local rows: a saved handshake, or a connection that turned clean. */
export type StoreProof = { kind: 'handshake'; applied: AppliedRows; vector: Uint8Array } | { kind: 'clean' };

/** Writes one connection's document to the store. */
export interface YDocWriter {
  /** Starts storing: a full snapshot, plus a local row when `unsynced`. Idempotent. */
  start(doc: Y.Doc, scope: { tenantId: string; organizationId: string; generation: string }, unsynced: boolean): void;
  /** Queues an applied update; flushed per task. `local` rows are broadcast to other tabs after the commit. */
  append(update: Uint8Array, local: boolean, fromTab?: { rowId: number | null }): void;
  /** Clears local rows: every row in `applied` (handshake), or this tab's own (clean). */
  prove(proof: StoreProof): Promise<void>;
  /** Moves the document to unsaveableYDocs. */
  park(reason: UnsaveableReason, doc: Y.Doc): Promise<void>;
  /** Deletes the stored document. */
  drop(): Promise<void>;
  /** True once storing failed for good (the quota, after eviction and one retry); edits still sync online. */
  readonly failed: boolean;
}

const notBuilt = (name: string) => new Error(`[yjs] ${name} is not built yet`);

/** The stored document, or null; null too when no database is bound. Nothing is stored yet, so always null. */
export async function loadYDoc(_key: YDocKey): Promise<LoadedYDoc | null> {
  return null;
}

/** A writer for one document's rows. */
export function createYDocWriter(_key: YDocKey): YDocWriter {
  throw notBuilt('createYDocWriter');
}

/** Resolves once every queued update is committed. Nothing is queued yet. */
export async function flushYjsStore(): Promise<void> {}

/** Deletes the least recently opened documents past the limits, never one with unsynced edits. Nothing is stored yet. */
export async function evictYDocs(): Promise<void> {}

/** Stored rows with unsynced edits plus parked ones, live; for the sign-out dialog. Nothing is stored yet: one empty list. */
export function watchUnsavedYDocs(cb: (docs: UnsavedYDoc[]) => void): () => void {
  cb([]);
  return () => {};
}

/** Whether a document is stored, and with unsynced edits; undefined while unknown. Nothing is stored yet. */
export function useStoredYDoc(key: YDocKey | undefined): { stored: boolean; unsynced: boolean } | undefined {
  return key ? { stored: false, unsynced: false } : undefined;
}
