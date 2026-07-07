import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { descriptionToYUpdate } from '../lib/blocknote-seed';
import type { MaterializableSession } from '../sync/materialize';
import { materializeState, postMaterialize, stateToBlocksJson } from '../sync/materialize';
import { mockDocContext } from './helpers';

const ctx = mockDocContext({ verified: true });

const description = JSON.stringify([
  { id: 'b1', type: 'paragraph', props: {}, content: [{ type: 'text', text: 'hello', styles: {} }], children: [] },
]);
const state = descriptionToYUpdate(description)!;

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('postMaterialize', () => {
  it('returns ok on 200 and sends the internal secret + payload', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await postMaterialize(ctx, 'user-1', '[]');

    expect(result).toBe('ok');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/yjs/materialize');
    expect(init.headers['x-yjs-secret']).toBe('test-yjs-secret-for-unit-tests');
    expect(JSON.parse(init.body)).toMatchObject({
      entityType: ctx.entityType,
      entityId: ctx.entityId,
      tenantId: ctx.tenantId,
      editedBy: 'user-1',
    });
  });

  it('classifies 4xx as permanent and 5xx as retry', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403 });
    expect(await postMaterialize(ctx, 'user-1', '[]')).toBe('permanent');

    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    expect(await postMaterialize(ctx, 'user-1', '[]')).toBe('retry');
  });

  it('classifies network errors as retry', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await postMaterialize(ctx, 'user-1', '[]')).toBe('retry');
  });
});

describe('materializeState', () => {
  it('skips the POST when content matches the baseline', async () => {
    const collab: MaterializableSession = { ctx, lastMaterializedJson: stateToBlocksJson(state)! };

    expect(await materializeState(collab, state)).toBe('ok');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs changed content, attributes the last editor, and advances the baseline', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
    const collab: MaterializableSession = { ctx, lastEditor: mockDocContext({ userId: 'editor-2' }) };

    expect(await materializeState(collab, state)).toBe('ok');

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).editedBy).toBe('editor-2');
    expect(collab.lastMaterializedJson).toBe(stateToBlocksJson(state));

    // Same content again → baseline hit, no second POST
    expect(await materializeState(collab, state)).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('advances the baseline on permanent failure (never re-posts unconvergeable content)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
    const collab: MaterializableSession = { ctx };

    expect(await materializeState(collab, state)).toBe('permanent');
    expect(collab.lastMaterializedJson).toBe(stateToBlocksJson(state));
  });

  it('keeps the baseline stale on retry so the next window tries again', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    const collab: MaterializableSession = { ctx };

    expect(await materializeState(collab, state)).toBe('retry');
    expect(collab.lastMaterializedJson).toBeUndefined();

    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
    expect(await materializeState(collab, state)).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
