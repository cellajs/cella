import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { descriptionToYUpdate } from '../lib/blocknote-seed';
import { postMaterialize, stateToBlocksJson } from '../sync/materialize';
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

describe('stateToBlocksJson', () => {
  it('converts a seeded state back to the stored blocks and returns null for garbage', () => {
    const blocks = JSON.parse(stateToBlocksJson(state)!) as { content: { text: string }[] }[];
    expect(blocks[0].content[0].text).toBe('hello');
    expect(stateToBlocksJson(new Uint8Array([255, 1, 2]))).toBeNull();
  });
});
