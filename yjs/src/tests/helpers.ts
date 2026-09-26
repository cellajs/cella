import { sign } from 'node:crypto';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { testYjsTokenKeyMaterial } from 'shared/testing/yjs-token-keys';
import { yjsTokenSigningKey } from 'shared/utils/yjs-token';
import { vi } from 'vitest';
import * as Y from 'yjs';
import type { DocKey, DocScope, SocketContext } from '../constants';
import type { StaleDocRow } from '../data/storage';

interface TokenOptions {
  userId: string;
  entityType?: string;
  entityId?: string;
  tenantId?: string;
  organizationId?: string | null;
  exp?: number;
  /** Key material to sign with; defaults to the backend's test key, whose public half the relay holds. */
  keyMaterial?: string;
}

/** The token as the backend signs it: base64url payload and an Ed25519 signature over it. */
export function signPayload(payload: unknown, keyMaterial = testYjsTokenKeyMaterial): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign(null, Buffer.from(payloadB64), yjsTokenSigningKey(keyMaterial)).toString('base64url');
  return `${payloadB64}.${signature}`;
}

/** Generate a validly signed token for tests. */
export function createSignedToken(opts: string | TokenOptions, exp?: number): string {
  const o: TokenOptions = typeof opts === 'string' ? { userId: opts, exp } : opts;
  const payload = {
    userId: o.userId,
    entityType: o.entityType ?? 'task',
    entityId: o.entityId ?? 'entity-1',
    tenantId: o.tenantId ?? 'tenant-1',
    organizationId: o.organizationId ?? 'org-1',
    exp: o.exp ?? Date.now() + 30 * 60 * 1000,
  };
  return signPayload(payload, o.keyMaterial);
}

export function createExpiredToken(userId: string): string {
  return createSignedToken({ userId, exp: Date.now() - 1000 });
}

/** A document scope with sensible defaults, as authorization reads it from the entity row. */
export function mockScope(overrides?: Partial<DocScope>): DocScope {
  return { entityType: 'task', entityId: 'entity-1', tenantId: 'tenant-1', organizationId: 'org-1', ...overrides };
}

/** A socket's context: authorized in `requested` unless `scope` says otherwise (null for a socket still pending). */
export function mockSocketContext(
  overrides: { userId?: string; requested?: DocScope; scope?: DocScope | null } = {},
): SocketContext {
  const requested = overrides.requested ?? mockScope();
  return {
    userId: overrides.userId ?? 'user-1',
    requested,
    scope: overrides.scope === undefined ? requested : overrides.scope,
  };
}

/** The fake storage's key for a document: its tenant, type and id. */
export const storageKey = ({ tenantId, entityType, entityId }: DocKey) => `${tenantId}:${entityType}:${entityId}`;

const YMessage = { Sync: 0, Awareness: 1 } as const;
const YSync = { Step1: 0, Update: 2 } as const;

export function buildSyncStep1(stateVector: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, YMessage.Sync);
  encoding.writeVarUint(encoder, YSync.Step1);
  encoding.writeVarUint8Array(encoder, stateVector);
  return encoding.toUint8Array(encoder);
}

export function buildSyncUpdate(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, YMessage.Sync);
  encoding.writeVarUint(encoder, YSync.Update);
  encoding.writeVarUint8Array(encoder, update);
  return encoding.toUint8Array(encoder);
}

/** An awareness update as y-protocols encodes it: each entry's client id, clock and JSON state (null removes it). */
export function awarenessUpdate(...entries: { clientId: number; clock?: number; state?: unknown }[]): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, entries.length);
  for (const { clientId, clock = 1, state = { user: { name: `client ${clientId}` } } } of entries) {
    encoding.writeVarUint(encoder, clientId);
    encoding.writeVarUint(encoder, clock);
    encoding.writeVarString(encoder, JSON.stringify(state));
  }
  return encoding.toUint8Array(encoder);
}

/** The client ids an awareness frame carries. */
export function awarenessClientIds(message: Uint8Array): number[] {
  const decoder = decoding.createDecoder(message);
  decoding.readVarUint(decoder); // MESSAGE_AWARENESS
  const update = decoding.createDecoder(decoding.readVarUint8Array(decoder));
  const ids: number[] = [];
  for (let count = decoding.readVarUint(update); count > 0; count--) {
    ids.push(decoding.readVarUint(update));
    decoding.readVarUint(update);
    decoding.readVarString(update);
  }
  return ids;
}

export function buildAwarenessMessage(data: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, YMessage.Awareness);
  encoding.writeVarUint8Array(encoder, data);
  return encoding.toUint8Array(encoder);
}

export function decodeSyncStep2(message: Uint8Array): Uint8Array {
  const decoder = decoding.createDecoder(message);
  decoding.readVarUint(decoder); // MESSAGE_SYNC
  decoding.readVarUint(decoder); // SYNC_STEP_2
  return decoding.readVarUint8Array(decoder);
}

export function decodeSyncStep1(message: Uint8Array): Uint8Array {
  const decoder = decoding.createDecoder(message);
  decoding.readVarUint(decoder); // MESSAGE_SYNC
  decoding.readVarUint(decoder); // SYNC_STEP_1
  return decoding.readVarUint8Array(decoder);
}

/** Lets chained promises (locks, fake storage gates) advance without moving timers. */
export async function flushMicrotasks(rounds = 50): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

/** Minimal fake WebSocket for unit tests; `closed` records the close the relay sent, if any. */
export function mockWebSocket(overrides?: { readyState?: number }): MockWebSocket {
  return {
    readyState: overrides?.readyState ?? 1,
    OPEN: 1,
    sent: [] as Uint8Array[],
    closed: null,
    send(data: Uint8Array) {
      this.sent.push(data);
    },
    close(code?: number, reason?: string) {
      this.closed = { code, reason };
      this.readyState = 2;
    },
  };
}

export interface MockWebSocket {
  readyState: number;
  OPEN: number;
  sent: Uint8Array[];
  closed: { code?: number; reason?: string } | null;
  send(data: Uint8Array): void;
  close(code?: number, reason?: string): void;
}

/** Use at top level: vi.mock('../data/storage', () => storageMock()) */
export const storageMock = () => ({
  loadBase: vi.fn().mockResolvedValue(null),
  ensureDoc: vi.fn().mockResolvedValue(new Uint8Array()),
  appendUpdate: vi.fn().mockResolvedValue(undefined),
  readLog: vi.fn().mockResolvedValue([]),
  compactState: vi.fn().mockResolvedValue(undefined),
  discardLogRows: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  listStaleDocs: vi.fn().mockResolvedValue([]),
});

/**
 * In-memory stand-in for the storage module with the real append/read/compact semantics, so relay
 * tests exercise ordering and durability. `delay` (a promise factory per call name) lets a test
 * hold one call open to interleave another.
 */
export function fakeStorage(delay?: (call: string) => Promise<void> | undefined) {
  const bases = new Map<string, Uint8Array>();
  const logs = new Map<string, { id: number; payload: Uint8Array; userId: string | null }[]>();
  let nextId = 1;
  const key = storageKey;
  const wait = async (call: string) => {
    const p = delay?.(call);
    if (p) await p;
  };
  const store = {
    bases,
    logs,
    loadBase: vi.fn(async (doc: DocKey) => {
      await wait('loadBase');
      return bases.get(key(doc)) ?? null;
    }),
    ensureDoc: vi.fn(async (scope: DocScope, seed: Uint8Array | null) => {
      await wait('ensureDoc');
      if (!bases.has(key(scope))) bases.set(key(scope), seed ?? new Uint8Array());
      return bases.get(key(scope))!;
    }),
    appendUpdate: vi.fn(async (scope: DocScope, userId: string, payload: Uint8Array) => {
      await wait('appendUpdate');
      const list = logs.get(key(scope)) ?? [];
      list.push({ id: nextId++, payload, userId: userId || null });
      logs.set(key(scope), list);
    }),
    readLog: vi.fn(async (doc: DocKey) => {
      await wait('readLog');
      return [...(logs.get(key(doc)) ?? [])];
    }),
    compactState: vi.fn(async (doc: DocKey, merged: Uint8Array, ids: number[]) => {
      await wait('compactState');
      bases.set(key(doc), merged);
      logs.set(
        key(doc),
        (logs.get(key(doc)) ?? []).filter((row) => !ids.includes(row.id)),
      );
    }),
    discardLogRows: vi.fn(async (doc: DocKey, ids: number[]) => {
      await wait('discardLogRows');
      logs.set(
        key(doc),
        (logs.get(key(doc)) ?? []).filter((row) => !ids.includes(row.id)),
      );
    }),
    deleteDoc: vi.fn(async (doc: DocKey) => {
      await wait('deleteDoc');
      bases.delete(key(doc));
      logs.delete(key(doc));
    }),
    listStaleDocs: vi.fn(async (): Promise<StaleDocRow[]> => []),
  };
  return store;
}

/** A one-shot gate: `release()` lets a held call continue. */
export function deferred(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/** A Y.Doc update that sets `key` on the `data` map, from a fresh client. */
export function mapUpdate(key: string, value: unknown): Uint8Array {
  const doc = new Y.Doc();
  doc.getMap('data').set(key, value);
  return Y.encodeStateAsUpdate(doc);
}

/** Applies a state to a fresh doc and reads the `data` map. */
export function readMap(state: Uint8Array): Record<string, unknown> {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  return doc.getMap('data').toJSON();
}
