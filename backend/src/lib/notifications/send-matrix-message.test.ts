import { afterEach, describe, expect, it, vi } from 'vitest';

const botAccessToken = 'syt_bot_access_token_value';

vi.mock('#/env', () => ({
  env: { ELEMENT_ROOM_ID: '!room:matrix.example', ELEMENT_BOT_ACCESS_TOKEN: botAccessToken },
}));
vi.mock('#/utils/logger', () => ({ log: { info: vi.fn(), error: vi.fn() } }));

const { sendMatrixMessage } = await import('./send-matrix-message');

describe('sendMatrixMessage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('must not leak the bot access token via the request URL (fetch spans record url.full)', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await sendMatrixMessage({ msgtype: 'm.notice', textMessage: 'hello' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).not.toContain(botAccessToken);
    expect(url).not.toContain('access_token');
    // The proof travels in the Authorization header, which no span or log records.
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${botAccessToken}`);
    expect(url).toContain('/_matrix/client/v3/rooms/');
    expect(init?.method).toBe('PUT');
  });
});
