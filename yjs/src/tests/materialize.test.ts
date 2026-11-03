import { appConfig } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { descriptionToSeed } from '#/modules/yjs/helpers/description-update';
import { postMaterialize, stateToBlocksJsonOrNull } from '../sync/materialize';
import { mockScope } from './helpers';

const ctx = mockScope();

const description = JSON.stringify([
  { id: 'b1', type: 'paragraph', props: {}, content: [{ type: 'text', text: 'hello', styles: {} }], children: [] },
]);
const state = descriptionToSeed(description);

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

    const result = await postMaterialize(ctx, ['user-1'], '[]', [41]);

    expect(result).toBe('ok');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`http://localhost:${appConfig.services.backend.internalPort}/internal/yjs/materialize`);
    expect(String(url).startsWith(appConfig.backendUrl)).toBe(false);
    expect(init.headers['x-yjs-relay-secret']).toBe('test-yjs-relay-secret-for-unit-tests');
    expect(init.headers).not.toHaveProperty('x-yjs-secret');
    expect(JSON.parse(init.body)).toMatchObject({
      entityType: ctx.entityType,
      entityId: ctx.entityId,
      tenantId: ctx.tenantId,
      editors: ['user-1'],
      serverRowIds: [41],
    });
  });

  it('must not let a refusal cost the log: every answer but 410 is a retry', async () => {
    // An editor who lost access, a 409 naming an outside write the merge lacks, a body the route rejects, an outage.
    for (const status of [400, 401, 403, 404, 409, 413, 429, 503]) {
      fetchMock.mockResolvedValueOnce({ ok: false, status });
      expect(await postMaterialize(ctx, ['user-1'], '[]', []), `status ${status}`).toBe('retry');
    }
  });

  it('classifies 410 as gone: the entity no longer exists, so its log has nowhere to go', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 410 });
    expect(await postMaterialize(ctx, ['user-1'], '[]', [])).toBe('gone');
  });

  it('classifies network errors as retry', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await postMaterialize(ctx, ['user-1'], '[]', [])).toBe('retry');
  });
});

describe('stateToBlocksJsonOrNull', () => {
  it('converts a seeded state back to the stored blocks and returns null for garbage', () => {
    const blocks = JSON.parse(stateToBlocksJsonOrNull(state, ctx)!) as { content: { text: string }[] }[];
    expect(blocks[0].content[0].text).toBe('hello');
    expect(stateToBlocksJsonOrNull(new Uint8Array([255, 1, 2]), ctx)).toBeNull();
  });
});
