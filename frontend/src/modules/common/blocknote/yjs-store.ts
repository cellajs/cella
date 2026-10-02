/**
 * Stores collaborative documents opened for editing in the per-user database (the Yjs tables of local-user-db.ts), so
 * they load before the provider connects and stay editable offline. A `local` row holds an edit no server answer has
 * proven saved, and only a proof clears it.
 */

import { onlineManager } from '@tanstack/react-query';
import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { appConfig, type ProductEntityType } from 'shared';
import type * as Y from 'yjs';
import { postTabUpdate, toTabKey } from '~/modules/common/blocknote/yjs-tab-channel';
import { useUIStore } from '~/modules/ui/ui-store';
import {
  getLocalUserDb,
  type LocalUserDatabase,
  type UnsaveableReason,
  type YDocKey,
  type YDocRecord,
  type YDocUpdateRecord,
} from '~/query/local-user-db';
import { subscribeOwnerChange } from '~/query/local-user-storage';
import { isLeader, tabCoordinatorStore } from '~/query/realtime/tab-coordinator';

/** The longest a load may hold up the provider's connect. */
export const STORE_LOAD_TIMEOUT_MS = 5_000;
/** A document's update rows are trimmed into its base past this many rows, or past `TRIM_BYTES`. */
export const TRIM_ROWS = 100;
export const TRIM_BYTES = 256 * 1024;
/** A trim waits this long for more rows, so a burst of edits trims once. */
export const TRIM_DEBOUNCE_MS = 2_000;
/** Eviction removes the least recently opened documents past this many, or past `MAX_STORED_BYTES` in all. */
export const MAX_STORED_DOCS = 200;
export const MAX_STORED_BYTES = 50 * 1024 * 1024;
/** Eviction leaves a document opened within this window alone: another tab may hold it open. */
export const EVICT_MIN_AGE_MS = 60 * 60_000;
/** Eviction runs at most this often after a first store or a trim. */
export const EVICT_INTERVAL_MS = 60_000;
/** Without offline access (session mode), eviction also drops synced documents not opened within this window. */
export const SESSION_KEEP_MS = 2 * 60 * 60_000;
/** The device's storage runs low below this many free bytes, or past `LOW_STORAGE_RATIO` of the quota used. */
export const LOW_STORAGE_BYTES = 100 * 1024 * 1024;
export const LOW_STORAGE_RATIO = 0.9;
/** Background connections boot resume opens at a time. */
export const RESUME_CONCURRENCY = 3;

/** The origin a stored state is applied with: no edit of this tab, and nothing to store again. */
export const storageOrigin = Symbol('yjs-store');

/** The page load writing rows: a clean proof clears this page's own `local` rows only. */
export const storeTabId = crypto.randomUUID();

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
  /** The parked row in `unsaveableYDocs`, which a discard deletes; absent while not parked. */
  parkedId?: number;
}

/** Where a stored document lives and which history it holds. */
export interface StoreScope {
  tenantId: string;
  organizationId: string;
  generation: string;
}

/** The proof that the server holds a document's local rows: a saved handshake, or a connection that turned clean. */
export type StoreProof = { kind: 'handshake'; applied: AppliedRows; vector: Uint8Array } | { kind: 'clean' };

/** Writes one connection's document to the store. */
export interface YDocWriter {
  /** Starts storing: a full snapshot, plus a local row when `unsynced`. Idempotent. */
  start(doc: Y.Doc, scope: StoreScope, unsynced: boolean): void;
  /** Queues an applied update; flushed per task. `local` rows are broadcast to other tabs after the commit. */
  append(update: Uint8Array, local: boolean, fromTab?: { rowId: number | null }): void;
  /** Clears local rows: every row in `applied` (handshake), or this tab's own (clean). */
  prove(proof: StoreProof): Promise<void>;
  /**
   * Moves the document to unsaveableYDocs: the stored state merged with `doc`'s, or the stored state alone before
   * `start`. Writes nothing more. Rejects when the move failed, and the edits then live only in `doc`.
   */
  park(reason: UnsaveableReason, doc: Y.Doc): Promise<void>;
  /** Deletes the stored document, and writes nothing more. */
  drop(): Promise<void>;
  /** True once storing failed for good (the quota, after eviction and one retry); edits still sync online. */
  readonly failed: boolean;
  /** True while local edits wait for their commit: until then they live only in the document. */
  readonly pending: boolean;
}

/** How a writer reports to its connection. */
export interface YDocWriterOptions {
  /** The connection's rows; the writer adds each own row once committed. */
  applied?: AppliedRows;
  /** Runs when `pending` or `failed` changed. */
  onChange?: () => void;
}

/** The storage warning of this session: the device runs low (`device`), or the limits are reached with nothing left to evict (`budget`). */
export type StoragePressure = 'device' | 'budget';

type DocKeyPath = [ProductEntityType, string];
const keyPath = (key: YDocKey): DocKeyPath => [key.entityType, key.entityId];
const rowsOf = (db: LocalUserDatabase, key: YDocKey) => db.yDocUpdates.where('[entityType+entityId]').equals(keyPath(key));

let yjsModule: Promise<typeof Y> | undefined;
/** Yjs, loaded on first use: boot-time code reads this module (teardown, eviction, the sign-out list), and a writer exists only once the editor loaded Yjs. */
const loadYjs = () => {
  yjsModule ??= import('yjs');
  return yjsModule;
};

const noop = () => {};

/** Writers of this tab, open or still flushing: what `flushYjsStore` waits for and eviction leaves alone. */
const writers = new Set<StoreWriter>();
/** Parks, drops and proofs under way, which `flushYjsStore` waits for too. */
const tasks = new Set<Promise<void>>();

/** Keeps `task` in `tasks` until it settles. */
function track(task: Promise<void>): Promise<void> {
  const settled = task.then(noop, noop);
  tasks.add(settled);
  void settled.then(() => tasks.delete(settled));
  return task;
}

/** True for the browser's quota error, which Dexie may wrap. */
function isQuotaError(error: unknown): boolean {
  const names = [(error as Error | undefined)?.name, (error as { inner?: Error } | undefined)?.inner?.name];
  return names.includes('QuotaExceededError');
}

/** Deletes a document's metadata, base and rows; inside a `rw` transaction over the three tables. */
async function deleteStored(db: LocalUserDatabase, key: YDocKey) {
  await db.yDocs.delete(keyPath(key));
  await db.yDocStates.delete(keyPath(key));
  await rowsOf(db, key).delete();
}

/** A stored document's base and rows in order; inside a transaction over `yDocStates` and `yDocUpdates`. */
async function readStored(db: LocalUserDatabase, key: YDocKey): Promise<{ updates: Uint8Array[]; rows: YDocUpdateRecord[] }> {
  const base = await db.yDocStates.get(keyPath(key));
  // Rows of one key come in id order: the compound index orders equal keys by primary key.
  const rows = await rowsOf(db, key).toArray();
  return { updates: [...(base ? [base.state] : []), ...rows.map((row) => row.update)], rows };
}

/** Moves a stored document to `unsaveableYDocs`, with `extra` merged in; inside a `rw` transaction over all four tables. */
async function parkStored(Yjs: typeof Y, db: LocalUserDatabase, record: YDocRecord, reason: UnsaveableReason, extra: Uint8Array[]) {
  const { updates } = await readStored(db, record);
  const { entityType, entityId, tenantId, organizationId, generation } = record;
  const state = Yjs.mergeUpdates([...updates, ...extra]);
  await db.unsaveableYDocs.add({ entityType, entityId, tenantId, organizationId, generation, reason, state, at: Date.now() });
  await deleteStored(db, record);
}

interface Batch {
  /** Local edits, merged into one `local` row and broadcast. */
  local: Uint8Array[];
  /** Updates from the relay, the HTTP routes, or a tab whose own write failed: one row, not local. */
  remote: Uint8Array[];
  /** The batch `start` queued: it stamps `lastOpenedAt`, and replaces a stored document of another generation. */
  start: boolean;
  /** The document holds unsynced edits no row has: a local row of its whole state. */
  fullLocal: boolean;
}

const emptyBatch = (): Batch => ({ local: [], remote: [], start: false, fullLocal: false });
const isEmptyBatch = (batch: Batch) => !batch.local.length && !batch.remote.length && !batch.start && !batch.fullLocal;

interface Commit {
  /** The own `local` row written, if any. */
  ownRowId: number | null;
  /** The row that holds exactly the batch's local edits, which the broadcast names; null when a row holds more. */
  broadcastRowId: number | null;
  /** The document was written whole: first stored, or rewritten after an eviction. */
  created: boolean;
  /** The document's update rows passed a trim threshold. */
  trim: boolean;
  /** The stored document is another generation's: this writer's document was replaced. */
  superseded: boolean;
}

class StoreWriter implements YDocWriter {
  failed = false;
  private doc: Y.Doc | null = null;
  private scope: StoreScope | null = null;
  private batch: Batch = emptyBatch();
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Batches being written, and those of them holding local edits. */
  private writing = 0;
  private writingLocal = 0;
  private chain: Promise<void> = Promise.resolve();
  /** Own `local` rows committed and not yet cleared by a proof. */
  private readonly ownRows = new Set<number>();
  /** Parked or dropped: nothing more is written. */
  private closed = false;
  /** Its document was destroyed: the writer flushes what it holds, then goes. */
  released = false;

  constructor(
    readonly key: YDocKey,
    private readonly db: LocalUserDatabase,
    private readonly opts: YDocWriterOptions,
  ) {}

  get pending() {
    return this.batch.local.length > 0 || this.batch.fullLocal || this.writingLocal > 0;
  }

  /** Something is queued or being written: the writer stays in `writers` until it is done. */
  private get busy() {
    return this.timer !== undefined || this.writing > 0;
  }

  start(doc: Y.Doc, scope: StoreScope, unsynced: boolean) {
    if (this.doc || this.closed) return;
    this.doc = doc;
    this.scope = scope;
    writers.add(this);
    doc.once('destroy', () => this.release());
    this.batch.start = true;
    if (unsynced) this.batch.fullLocal = true;
    this.schedule();
    if (unsynced) this.opts.onChange?.();
  }

  append(update: Uint8Array, local: boolean, fromTab?: { rowId: number | null }) {
    if (this.closed || !this.scope) return;
    // Another tab stored its edit under a row; only one whose write failed is stored here.
    if (fromTab && fromTab.rowId !== null) return;
    if (this.failed) {
      if (local && !fromTab) this.broadcast(update, null);
      return;
    }
    const wasPending = this.pending;
    if (local && !fromTab) this.batch.local.push(update);
    else this.batch.remote.push(update);
    this.schedule();
    if (this.pending !== wasPending) this.opts.onChange?.();
  }

  /** Writes what is queued now; resolves once every write so far committed. */
  flush(): Promise<void> {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    const batch = this.batch;
    this.batch = emptyBatch();
    if (isEmptyBatch(batch)) return this.chain;
    const holdsLocal = batch.local.length > 0 || batch.fullLocal;
    this.writing++;
    if (holdsLocal) this.writingLocal++;
    return this.enqueue(() => this.write(batch))
      .catch((error) => console.warn('[yjs-store] Write failed', error))
      .finally(() => {
        this.writing--;
        if (holdsLocal) this.writingLocal--;
        this.opts.onChange?.();
        if (this.released && !this.busy) writers.delete(this);
      });
  }

  prove(proof: StoreProof): Promise<void> {
    if (this.closed) return Promise.resolve();
    // What the proof covers is fixed now: rows committed later stay local until the next proof.
    const own = proof.kind === 'clean' ? [...this.ownRows] : null;
    if (own && own.length === 0) return Promise.resolve();
    const covers = (id: number) => (own ? own.includes(id) : proof.kind === 'handshake' && (id <= proof.applied.upTo || proof.applied.ids.has(id)));
    return this.enqueueTask(async () => {
      const scope = this.scope;
      if (this.closed || !scope) return;
      const k = keyPath(this.key);
      await this.db
        .transaction('rw', this.db.yDocs, this.db.yDocUpdates, async () => {
          const record = await this.db.yDocs.get(k);
          // Another generation's rows are another history, which this proof says nothing about.
          if (!record || record.generation !== scope.generation) return;
          await rowsOf(this.db, this.key)
            .filter((row) => row.local === 1 && row.id !== undefined && covers(row.id))
            .modify({ local: 0 });
          const left = await rowsOf(this.db, this.key)
            .filter((row) => row.local === 1)
            .count();
          await this.db.yDocs.put({
            ...record,
            unsynced: left > 0 ? 1 : 0,
            ...(proof.kind === 'handshake' ? { syncedVector: proof.vector } : {}),
          });
        })
        // A proof that failed leaves rows local, which is the safe direction: the next proof clears them.
        .catch((error) => console.warn('[yjs-store] Proof not stored', error));
      for (const id of this.ownRows) if (covers(id)) this.ownRows.delete(id);
    });
  }

  park(reason: UnsaveableReason, doc: Y.Doc): Promise<void> {
    const scope = this.scope;
    this.close();
    return this.enqueueTask(async () => {
      const Yjs = await loadYjs();
      await this.db.transaction('rw', [this.db.yDocs, this.db.yDocStates, this.db.yDocUpdates, this.db.unsaveableYDocs], async () => {
        const record = await this.db.yDocs.get(keyPath(this.key));
        const own = record && (!scope || record.generation === scope.generation) ? record : undefined;
        // Before `start` the writer knows no generation, so `doc` may hold another history: the stored state alone.
        const extra = scope ? [Yjs.encodeStateAsUpdate(doc)] : [];
        if (own) return parkStored(Yjs, this.db, own, reason, extra);
        if (!scope) return;
        await this.db.unsaveableYDocs.add({ ...this.key, ...scope, reason, state: extra[0], at: Date.now() });
      });
    });
  }

  drop(): Promise<void> {
    const scope = this.scope;
    this.close();
    return this.enqueueTask(async () => {
      await this.db.transaction('rw', this.db.yDocs, this.db.yDocStates, this.db.yDocUpdates, async () => {
        const record = await this.db.yDocs.get(keyPath(this.key));
        if (record && (!scope || record.generation === scope.generation)) await deleteStored(this.db, this.key);
      });
    });
  }

  /** The document was destroyed with its connection: flush what it holds, and no longer count it as open. */
  private release() {
    this.released = true;
    void this.flush();
    if (!this.busy) writers.delete(this);
  }

  private close() {
    this.closed = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.batch = emptyBatch();
    this.released = true;
    if (!this.busy) writers.delete(this);
  }

  /** Runs `task` after every earlier write and proof of this writer; the chain itself never rejects. */
  private enqueue(task: () => Promise<void>): Promise<void> {
    const run = this.chain.then(task);
    this.chain = run.then(noop, noop);
    return run;
  }

  /** As `enqueue`, for a proof, park or drop: `flushYjsStore` waits for it too. */
  private enqueueTask(task: () => Promise<void>): Promise<void> {
    return track(this.enqueue(task));
  }

  private schedule() {
    if (this.timer !== undefined) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, 0);
  }

  private broadcast(update: Uint8Array, rowId: number | null) {
    if (!this.scope) return;
    postTabUpdate({ t: 'update', key: toTabKey(this.key), generation: this.scope.generation, update, rowId });
  }

  private async write(batch: Batch) {
    const { doc, scope } = this;
    if (this.closed || !doc || !scope) return;
    const Yjs = await loadYjs();
    const local = batch.local.length ? Yjs.mergeUpdates(batch.local) : null;
    const remote = batch.remote.length ? Yjs.mergeUpdates(batch.remote) : null;

    let commit: Commit | null = null;
    for (let attempt = 0; attempt < 2 && !commit; attempt++) {
      try {
        commit = await this.commit(Yjs, doc, scope, { batch, local, remote, unproven: this.ownRows.size > 0 });
      } catch (error) {
        // Signed out, or deleted in another tab: the database is gone, and the write with it.
        if (getLocalUserDb() !== this.db) {
          this.closed = true;
          return;
        }
        if (attempt > 0) {
          this.fail(error);
          break;
        }
        // A quota error evicts and trims before the one retry; a database another tab upgraded reopens on it.
        if (isQuotaError(error)) await relieveQuota(this.key);
      }
    }
    if (commit?.superseded) this.fail(new Error('the stored document is another generation'));
    if (this.closed) return;

    // A document written whole holds no row this writer wrote before.
    if (commit?.created) this.ownRows.clear();
    if (commit?.ownRowId) {
      this.ownRows.add(commit.ownRowId);
      this.opts.applied?.ids.add(commit.ownRowId);
    }
    if (local) this.broadcast(local, commit?.superseded ? null : (commit?.broadcastRowId ?? null));
    if (commit?.trim) scheduleTrim(this.key);
    if (commit?.created) scheduleEviction();
  }

  /** One `rw` transaction: the batch's rows, or the whole document when none is stored, and the metadata. */
  private commit(
    Yjs: typeof Y,
    doc: Y.Doc,
    scope: StoreScope,
    { batch, local, remote, unproven }: { batch: Batch; local: Uint8Array | null; remote: Uint8Array | null; unproven: boolean },
  ): Promise<Commit> {
    const { db, key } = this;
    return db.transaction('rw', [db.yDocs, db.yDocStates, db.yDocUpdates, db.unsaveableYDocs], async () => {
      const now = Date.now();
      const result: Commit = { ownRowId: null, broadcastRowId: null, created: false, trim: false, superseded: false };
      let record = await db.yDocs.get(keyPath(key));

      if (record && record.generation !== scope.generation) {
        // A later append meets a document another tab replaced: this one's document is the stale one.
        if (!batch.start) return { ...result, superseded: true };
        // Starting on a reseeded document: the stored one is another history. Its unsynced edits are kept as unsaveable.
        if (record.unsynced) await parkStored(Yjs, db, record, 'replaced', []);
        else await deleteStored(db, key);
        record = undefined;
      }

      const addRow = (update: Uint8Array, isLocal: boolean) =>
        db.yDocUpdates.add({ ...key, update, local: isLocal ? 1 : 0, tabId: storeTabId }) as Promise<number>;

      if (!record) {
        // First stored, or deleted under this tab: the whole document, with one local row of it when unsynced. Own
        // rows not yet proven went with the deleted document, and their edits are in this one.
        const state = Yjs.encodeStateAsUpdate(doc);
        await db.yDocStates.put({ ...key, state });
        const unsynced = batch.fullLocal || local !== null || unproven;
        if (unsynced) result.ownRowId = await addRow(state, true);
        const updateBytes = unsynced ? state.byteLength : 0;
        await db.yDocs.put({
          ...key,
          ...scope,
          syncedVector: null,
          unsynced: unsynced ? 1 : 0,
          bytes: state.byteLength + updateBytes,
          updateBytes,
          updatedAt: now,
          lastOpenedAt: now,
        });
        return { ...result, created: true };
      }

      let added = 0;
      if (remote) {
        await addRow(remote, false);
        added += remote.byteLength;
      }
      if (batch.fullLocal) {
        // Edits made before storing started are in no row: the whole document covers them, and the batch's own.
        const state = Yjs.encodeStateAsUpdate(doc);
        result.ownRowId = await addRow(state, true);
        added += state.byteLength;
      } else if (local) {
        result.ownRowId = await addRow(local, true);
        result.broadcastRowId = result.ownRowId;
        added += local.byteLength;
      }
      const next: YDocRecord = {
        ...record,
        bytes: record.bytes + added,
        updateBytes: record.updateBytes + added,
        unsynced: result.ownRowId !== null ? 1 : record.unsynced,
        updatedAt: now,
        lastOpenedAt: batch.start ? now : record.lastOpenedAt,
      };
      await db.yDocs.put(next);
      const rows = await rowsOf(db, key).count();
      return { ...result, trim: rows > TRIM_ROWS || next.updateBytes > TRIM_BYTES };
    });
  }

  private fail(error: unknown) {
    console.warn('[yjs-store] Storing failed; edits stay in memory and still sync online', error);
    this.failed = true;
    this.opts.onChange?.();
    if (isQuotaError(error)) reportPressure('device');
  }
}

/** The stored document, or null; null too when no database is bound. */
export async function loadYDoc(key: YDocKey): Promise<LoadedYDoc | null> {
  const db = getLocalUserDb();
  if (!db) return null;
  return db.transaction('r', db.yDocs, db.yDocStates, db.yDocUpdates, async () => {
    const record = await db.yDocs.get(keyPath(key));
    if (!record) return null;
    const { updates, rows } = await readStored(db, key);
    return { record, updates, appliedUpTo: rows.at(-1)?.id ?? 0 };
  });
}

/** A writer for one document's rows, on the bound user's database; null while none is bound. */
export function createYDocWriter(key: YDocKey, opts: YDocWriterOptions = {}): YDocWriter | null {
  const db = getLocalUserDb();
  if (!db) return null;
  return new StoreWriter({ entityType: key.entityType, entityId: key.entityId }, db, opts);
}

/** Resolves once every queued update is committed. */
export async function flushYjsStore(): Promise<void> {
  await Promise.all([...[...writers].map((writer) => writer.flush()), ...tasks]);
}

const trimTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Trims a document `TRIM_DEBOUNCE_MS` after its last call. */
function scheduleTrim(key: YDocKey) {
  const id = toTabKey(key);
  clearTimeout(trimTimers.get(id));
  trimTimers.set(
    id,
    setTimeout(() => {
      trimTimers.delete(id);
      void trimYDoc(key).catch((error) => console.warn('[yjs-store] Trim failed', error));
    }, TRIM_DEBOUNCE_MS),
  );
}

/**
 * Folds a document's base and every row that is not `local` into a new base, through a document with garbage
 * collection on, so deleted content shrinks. It deletes exactly the rows it read; `local` rows stay, as the outbox.
 */
export async function trimYDoc(key: YDocKey, db: LocalUserDatabase | null = getLocalUserDb()): Promise<void> {
  if (!db) return;
  const Yjs = await loadYjs();
  await db.transaction('rw', db.yDocs, db.yDocStates, db.yDocUpdates, async () => {
    const record = await db.yDocs.get(keyPath(key));
    if (!record) return;
    const base = await db.yDocStates.get(keyPath(key));
    const rows = await rowsOf(db, key).toArray();
    const folded = rows.filter((row) => row.local === 0);
    if (folded.length === 0) return;

    const doc = new Yjs.Doc({ gc: true });
    Yjs.transact(doc, () => {
      if (base) Yjs.applyUpdate(doc, base.state);
      for (const row of folded) Yjs.applyUpdate(doc, row.update);
    });
    // Structs that wait for a local row's are kept too: encoding includes pending structs.
    const state = Yjs.encodeStateAsUpdate(doc);
    doc.destroy();

    await db.yDocStates.put({ ...key, state });
    await db.yDocUpdates.bulkDelete(folded.map((row) => row.id as number));
    const updateBytes = rows.filter((row) => row.local === 1).reduce((sum, row) => sum + row.update.byteLength, 0);
    await db.yDocs.put({ ...record, bytes: state.byteLength + updateBytes, updateBytes, updatedAt: Date.now() });
  });
  scheduleEviction();
}

/** A quota error: make room by evicting, and by trimming the document being written. */
async function relieveQuota(key: YDocKey) {
  await evictYDocs().catch(noop);
  await trimYDoc(key).catch(noop);
}

let lastEvictionAt = 0;
let evictionTimer: ReturnType<typeof setTimeout> | undefined;

/** Evicts now, or once `EVICT_INTERVAL_MS` passed since the last run. */
function scheduleEviction() {
  if (evictionTimer) return;
  const wait = Math.max(0, lastEvictionAt + EVICT_INTERVAL_MS - Date.now());
  evictionTimer = setTimeout(() => {
    evictionTimer = undefined;
    void evictYDocs().catch((error) => console.warn('[yjs-store] Eviction failed', error));
  }, wait);
}

/** Keys of the documents open in this tab. */
const openKeys = () => new Set([...writers].filter((writer) => !writer.released).map((writer) => toTabKey(writer.key)));

/**
 * Deletes the least recently opened documents while more than `MAX_STORED_DOCS` are stored or more than
 * `MAX_STORED_BYTES` in all, and in session mode every one not opened within `SESSION_KEEP_MS`. Never one with
 * unsynced edits, one open in this tab, or one opened within `EVICT_MIN_AGE_MS` (which may be open in another);
 * parked edits are never evicted. Then checks the device's storage.
 */
export async function evictYDocs(): Promise<void> {
  const db = getLocalUserDb();
  if (!db) return;
  lastEvictionAt = Date.now();
  const now = Date.now();
  const sessionMode = !useUIStore.getState().offlineAccess;
  const open = openKeys();
  const evictable = (record: YDocRecord) => record.unsynced === 0 && !open.has(toTabKey(record)) && now - record.lastOpenedAt > EVICT_MIN_AGE_MS;

  const records = await db.yDocs.orderBy('lastOpenedAt').toArray();
  let count = records.length;
  let bytes = records.reduce((sum, record) => sum + record.bytes, 0);
  const victims: YDocRecord[] = [];
  for (const record of records) {
    if (!evictable(record)) continue;
    const expired = sessionMode && now - record.lastOpenedAt > SESSION_KEEP_MS;
    if (!expired && count <= MAX_STORED_DOCS && bytes <= MAX_STORED_BYTES) continue;
    victims.push(record);
    count--;
    bytes -= record.bytes;
  }

  if (victims.length > 0) {
    await db.transaction('rw', db.yDocs, db.yDocStates, db.yDocUpdates, async () => {
      for (const victim of victims) {
        // Another tab may have edited or opened it since the scan.
        const record = await db.yDocs.get(keyPath(victim));
        if (record && evictable(record) && record.lastOpenedAt === victim.lastOpenedAt) await deleteStored(db, victim);
      }
    });
  }
  if (count > MAX_STORED_DOCS || bytes > MAX_STORED_BYTES) reportPressure('budget');
  await checkDeviceStorage();
}

/** Reports `device` pressure when the browser's estimate says storage runs low. */
async function checkDeviceStorage() {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return;
  const estimate = await navigator.storage.estimate().catch(() => null);
  if (!estimate?.quota || estimate.usage === undefined) return;
  if (estimate.quota - estimate.usage < LOW_STORAGE_BYTES || estimate.usage / estimate.quota > LOW_STORAGE_RATIO) reportPressure('device');
}

let pressure: StoragePressure | null = null;
const pressureListeners = new Set<(pressure: StoragePressure) => void>();

/** Reports storage pressure once per session. */
function reportPressure(next: StoragePressure) {
  if (pressure) return;
  pressure = next;
  for (const listener of pressureListeners) listener(next);
}

/** Calls `cb` once with this session's storage warning, now if one was reported already; for the storage warning toast. */
export function watchStoragePressure(cb: (pressure: StoragePressure) => void): () => void {
  if (pressure) cb(pressure);
  pressureListeners.add(cb);
  return () => pressureListeners.delete(cb);
}

/** Stored documents with unsynced edits, then parked ones. */
async function readUnsaved(db: LocalUserDatabase): Promise<UnsavedYDoc[]> {
  return db.transaction('r', db.yDocs, db.unsaveableYDocs, async () => {
    const stored = await db.yDocs.filter((record) => record.unsynced === 1).toArray();
    const parked = await db.unsaveableYDocs.toArray();
    return [
      ...stored.map(({ entityType, entityId, tenantId, organizationId }) => ({ entityType, entityId, tenantId, organizationId, parked: null })),
      ...parked.map(({ id, entityType, entityId, tenantId, organizationId, reason }) => ({
        entityType,
        entityId,
        tenantId,
        organizationId,
        parked: reason,
        parkedId: id,
      })),
    ];
  });
}

/** A live query on the bound user's database, resubscribed when another user binds; `empty` while none is. */
function watchLocalUserDb<T>(query: (db: LocalUserDatabase) => Promise<T>, empty: T, cb: (value: T) => void): () => void {
  let subscription: { unsubscribe: () => void } | null = null;
  const subscribe = () => {
    subscription?.unsubscribe();
    subscription = null;
    const db = getLocalUserDb();
    if (!db) return cb(empty);
    subscription = liveQuery(() => query(db)).subscribe({
      next: cb,
      error: (error) => console.error('[yjs-store] Live query failed', error),
    });
  };
  subscribe();
  // liveQuery tracks only the database it first resolved.
  const stopOwnerChange = subscribeOwnerChange(subscribe);
  return () => {
    subscription?.unsubscribe();
    stopOwnerChange();
  };
}

/** Stored rows with unsynced edits plus parked ones, live; for the sign-out dialog. */
export function watchUnsavedYDocs(cb: (docs: UnsavedYDoc[]) => void): () => void {
  return watchLocalUserDb(readUnsaved, [], cb);
}

type StoredState = { stored: boolean; unsynced: boolean };

/** Whether a document is stored, and with unsynced edits; undefined while unknown. */
export function useStoredYDoc(key: YDocKey | undefined): StoredState | undefined {
  const entityType = key?.entityType;
  const entityId = key?.entityId;
  const id = entityType && entityId ? `${entityType}:${entityId}` : null;
  const [state, setState] = useState<{ id: string; value: StoredState } | null>(null);

  useEffect(() => {
    if (!entityType || !entityId) return;
    const id = `${entityType}:${entityId}`;
    return watchLocalUserDb(
      (db) => db.yDocs.get([entityType, entityId]),
      undefined,
      (record) =>
        setState((prev) => {
          const value = { stored: !!record, unsynced: record?.unsynced === 1 };
          return prev?.id === id && prev.value.stored === value.stored && prev.value.unsynced === value.unsynced ? prev : { id, value };
        }),
    );
  }, [entityType, entityId]);

  return id && state?.id === id ? state.value : undefined;
}

/** Documents with unsynced edits a background connection should upload. */
export async function listUnsyncedYDocs(): Promise<YDocRecord[]> {
  const db = getLocalUserDb();
  if (!db) return [];
  return db.yDocs.filter((record) => record.unsynced === 1).toArray();
}

let resuming: Promise<void> | null = null;

/**
 * In the leader tab, uploads the stored documents with unsynced edits through background connections, a few at a time:
 * without it, edits made offline in a tab since closed reach other users only when their author reopens the document.
 */
export function resumeYDocs(): Promise<void> {
  if (resuming) return resuming;
  resuming = (async () => {
    if (!isLeader() || !onlineManager.isOnline() || !appConfig.services.yjs.enabled || !appConfig.yjsUrl) return;
    const queue = await listUnsyncedYDocs();
    if (queue.length === 0) return;
    const { resumeConnection } = await import('~/modules/common/blocknote/yjs-connections');
    const worker = async () => {
      for (let record = queue.shift(); record; record = queue.shift()) {
        await resumeConnection(record).catch((error) => console.warn('[yjs-store] Resume failed', error));
      }
    };
    await Promise.all(Array.from({ length: Math.min(RESUME_CONCURRENCY, queue.length) }, worker));
  })().finally(() => {
    resuming = null;
  });
  return resuming;
}

/**
 * Starts the store's work outside editors: on each user's database every tab evicts, and the leader tab resumes
 * unsynced documents, again when it becomes leader and when the browser is back online. Returns the stop.
 */
export function startYjsStore(): () => void {
  const onBound = () => {
    if (!getLocalUserDb()) return;
    void evictYDocs().catch((error) => console.warn('[yjs-store] Eviction failed', error));
    void resumeYDocs();
  };
  const stops = [
    subscribeOwnerChange((owner) => {
      if (owner) onBound();
    }),
    tabCoordinatorStore.subscribe((state, prev) => {
      if (state.isLeader && !prev.isLeader) void resumeYDocs();
    }),
    onlineManager.subscribe((online) => {
      if (online) void resumeYDocs();
    }),
  ];
  onBound();
  return () => {
    for (const stop of stops) stop();
  };
}
