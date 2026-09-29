import { appConfig } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { descriptionToYUpdate } from '../lib/blocknote-seed';
import { postMaterialize, stateToBlocksJson } from '../sync/materialize';
import { mockScope } from './helpers';

const ctx = mockScope();

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
  it("sends the relay secret only to the backend's internal listener, never the public API", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await postMaterialize(ctx, ['user-1'], '[]');

    expect(result).toBe('ok');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`http://localhost:${appConfig.devPorts.internal}/internal/yjs/materialize`);
    expect(String(url).startsWith(appConfig.backendUrl)).toBe(false);
    expect(init.headers['x-yjs-relay-secret']).toBe('test-yjs-relay-secret-for-unit-tests');
    expect(init.headers).not.toHaveProperty('x-yjs-secret');
    expect(JSON.parse(init.body)).toMatchObject({
      entityType: ctx.entityType,
      entityId: ctx.entityId,
      tenantId: ctx.tenantId,
      editors: ['user-1'],
    });
  });

  it('classifies a rejected request as permanent, and refusals that can change and 5xx as retry', async () => {
    for (const status of [400, 413, 422]) {
      fetchMock.mockResolvedValueOnce({ ok: false, status });
      expect(await postMaterialize(ctx, ['user-1'], '[]'), `status ${status}`).toBe('permanent');
    }
    // Access, scope and secret refusals can change: an editor who lost access must not cost the log.
    for (const status of [401, 403, 404, 409, 429, 503]) {
      fetchMock.mockResolvedValueOnce({ ok: false, status });
      expect(await postMaterialize(ctx, ['user-1'], '[]'), `status ${status}`).toBe('retry');
    }
  });

  it('classifies 410 as gone: the entity no longer exists, so its log has nowhere to go', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 410 });
    expect(await postMaterialize(ctx, ['user-1'], '[]')).toBe('gone');
  });

  it('classifies network errors as retry', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await postMaterialize(ctx, ['user-1'], '[]')).toBe('retry');
  });
});

describe('stateToBlocksJson', () => {
  it('converts a seeded state back to the stored blocks and returns null for garbage', () => {
    const blocks = JSON.parse(stateToBlocksJson(state)!) as { content: { text: string }[] }[];
    expect(blocks[0].content[0].text).toBe('hello');
    expect(stateToBlocksJson(new Uint8Array([255, 1, 2]))).toBeNull();
  });
});
