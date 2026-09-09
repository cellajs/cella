import { createHmac } from 'node:crypto';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { vi } from 'vitest';
import * as Y from 'yjs';
import type { DocContext } from '../constants';

const DELIMITER = '.';
const SIGNATURE_LENGTH = 16;
const TEST_SECRET = 'test-yjs-secret-for-unit-tests';

function computeSignature(encodedPayload: string, secret = TEST_SECRET): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('hex').slice(0, SIGNATURE_LENGTH);
}

interface TokenOptions {
  userId: string;
  entityType?: string;
  tenantId?: string;
  organizationId?: string | null;
  exp?: number;
  secret?: string;
}

/** Generate a valid HMAC-signed token for tests. */
export function createSignedToken(opts: string | TokenOptions, exp?: number, secret?: string): string {
  const o: TokenOptions = typeof opts === 'string' ? { userId: opts, exp, secret } : opts;
  const payload = {
    userId: o.userId,
    entityType: o.entityType ?? 'task',
    tenantId: o.tenantId ?? 'tenant-1',
    organizationId: o.organizationId ?? 'org-1',
    exp: o.exp ?? Date.now() + 30 * 60 * 1000,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = computeSignature(payloadB64, o.secret ?? secret);
  return `${payloadB64}${DELIMITER}${signature}`;
}

export function createExpiredToken(userId: string): string {
  return createSignedToken({ userId, exp: Date.now() - 1000 });
}

/** Factory for DocContext with sensible defaults. */
export function mockDocContext(overrides?: Partial<DocContext>): DocContext {
  return {
    entityType: 'task',
    entityId: 'entity-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    organizationId: 'org-1',
    verified: false,
    ...overrides,
  };
}

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

/** Minimal fake WebSocket for unit tests. */
export function mockWebSocket(overrides?: { readyState?: number }): MockWebSocket {
  return {
    readyState: overrides?.readyState ?? 1,
    OPEN: 1,
    sent: [] as Uint8Array[],
    send(data: Uint8Array) {
      this.sent.push(data);
    },
  };
}

export interface MockWebSocket {
  readyState: number;
  OPEN: number;
  sent: Uint8Array[];
  send(data: Uint8Array): void;
}

/** Use at top level: vi.mock('../data/storage', () => storageMock()) */
export const storageMock = () => ({
  loadBase: vi.fn().mockResolvedValue(null),
  ensureDoc: vi.fn().mockResolvedValue(new Uint8Array()),
  appendUpdate: vi.fn().mockResolvedValue(undefined),
  readLog: vi.fn().mockResolvedValue([]),
  compactState: vi.fn().mockResolvedValue(undefined),
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
  const key = (ctx: DocContext) => `${ctx.entityType}:${ctx.entityId}`;
  const wait = async (call: string) => {
    const p = delay?.(call);
    if (p) await p;
  };
  const store = {
    bases,
    logs,
    loadBase: vi.fn(async (ctx: DocContext) => {
      await wait('loadBase');
      return bases.get(key(ctx)) ?? null;
    }),
    ensureDoc: vi.fn(async (ctx: DocContext, seed: Uint8Array | null) => {
      await wait('ensureDoc');
      if (!bases.has(key(ctx))) bases.set(key(ctx), seed ?? new Uint8Array());
      return bases.get(key(ctx))!;
    }),
    appendUpdate: vi.fn(async (ctx: DocContext, payload: Uint8Array) => {
      await wait('appendUpdate');
      const list = logs.get(key(ctx)) ?? [];
      list.push({ id: nextId++, payload, userId: ctx.userId || null });
      logs.set(key(ctx), list);
    }),
    readLog: vi.fn(async (ctx: DocContext) => {
      await wait('readLog');
      return [...(logs.get(key(ctx)) ?? [])];
    }),
    compactState: vi.fn(async (ctx: DocContext, merged: Uint8Array, ids: number[]) => {
      await wait('compactState');
      bases.set(key(ctx), merged);
      logs.set(
        key(ctx),
        (logs.get(key(ctx)) ?? []).filter((row) => !ids.includes(row.id)),
      );
    }),
    deleteDoc: vi.fn(async (ctx: DocContext) => {
      await wait('deleteDoc');
      bases.delete(key(ctx));
      logs.delete(key(ctx));
    }),
    listStaleDocs: vi.fn(async () => []),
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
