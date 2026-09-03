import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '#/core/context';
import type { ModuleNotifications } from '#/lib/module';
import type { MutationPayload } from '#/lib/mutation-bus';
import { deriveMentionsFor } from './derive-mentions';

// Rows whose stored mentions are stale (body carries none), so a derivation that runs must write
// an empty set without touching the permission engine.
const staleRow = {
  id: 'row-1',
  createdBy: null,
  organizationId: 'org-1',
  description: '<p>none</p>',
  mentions: ['u1'],
};

// Test mock: only `var.db` is forwarded to `writeMentions`, so the full Hono context is not built.
const ctx = { var: { db: {} } } as unknown as AuthContext;

function source(deriveFrom: ModuleNotifications['deriveFrom']) {
  const writeMentions = vi.fn(async () => {});
  const declaration: ModuleNotifications = { mentionable: true, deriveFrom, loadRows: async () => [], writeMentions };
  return { declaration, writeMentions };
}

const run = async (deriveFrom: ModuleNotifications['deriveFrom'], payload: MutationPayload) => {
  const { declaration, writeMentions } = source(deriveFrom);
  await deriveMentionsFor('attachment', declaration)(ctx, payload);
  return writeMentions.mock.calls.length;
};

describe('deriveMentionsFor deriveFrom', () => {
  it('defaults to client writes, skipping Yjs materialization', async () => {
    expect(await run(undefined, { after: [staleRow] })).toBe(1);
    expect(await run(undefined, { after: [staleRow], serverOrigin: true })).toBe(0);
  });

  it('materialized: derives only from server-origin writes, the body of record for Yjs-edited rows', async () => {
    expect(await run('materialized', { after: [staleRow], serverOrigin: true })).toBe(1);
    expect(await run('materialized', { after: [staleRow] })).toBe(0);
  });

  it('both: derives from either path', async () => {
    expect(await run('both', { after: [staleRow] })).toBe(1);
    expect(await run('both', { after: [staleRow], serverOrigin: true })).toBe(1);
  });

  it('writes nothing when the derived set already matches the stored one', async () => {
    const current = { ...staleRow, mentions: [] };
    expect(await run('both', { after: [current], serverOrigin: true })).toBe(0);
  });
});
