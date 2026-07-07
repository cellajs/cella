import { createHmac } from 'node:crypto';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { vi } from 'vitest';
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

/** Generate an expired token. */
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

// y-protocols message types
const YMessage = { Sync: 0, Awareness: 1 } as const;
const YSync = { Step1: 0, Update: 2 } as const;

/** Encode a sync-step-1 binary message. */
export function buildSyncStep1(stateVector: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, YMessage.Sync);
  encoding.writeVarUint(encoder, YSync.Step1);
  encoding.writeVarUint8Array(encoder, stateVector);
  return encoding.toUint8Array(encoder);
}

/** Encode a sync-update binary message. */
export function buildSyncUpdate(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, YMessage.Sync);
  encoding.writeVarUint(encoder, YSync.Update);
  encoding.writeVarUint8Array(encoder, update);
  return encoding.toUint8Array(encoder);
}

/** Encode an awareness binary message. */
export function buildAwarenessMessage(data: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, YMessage.Awareness);
  encoding.writeVarUint8Array(encoder, data);
  return encoding.toUint8Array(encoder);
}

/** Decode a sync-step-2 response to extract the update payload. */
export function decodeSyncStep2(message: Uint8Array): Uint8Array {
  const decoder = decoding.createDecoder(message);
  decoding.readVarUint(decoder); // MESSAGE_SYNC
  decoding.readVarUint(decoder); // SYNC_STEP_2
  return decoding.readVarUint8Array(decoder);
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

/**
 * Mock factory for storage module.
 * Use at top level: vi.mock('../data/storage', () => storageMock())
 */
export const storageMock = () => ({
  loadState: vi.fn().mockResolvedValue(null),
  saveState: vi.fn().mockResolvedValue(undefined),
  createDoc: vi.fn().mockResolvedValue(undefined),
  deleteState: vi.fn().mockResolvedValue(undefined),
  listStaleDocs: vi.fn().mockResolvedValue([]),
  deleteStaleDoc: vi.fn().mockResolvedValue(undefined),
});
