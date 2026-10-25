import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/query/offline/connectivity', () => ({ checkConnectivity: vi.fn() }));

const { ApiError } = await import('~/lib/api');
const { createClientConfig } = await import('~/lib/api-client');
const { getConsentDetails } = await import('~/lib/oauth-interaction');

const { fetch: clientFetch } = createClientConfig({});

/** Answers the next request with this response and returns what the client throws for it. */
const failWith = async (response: Response) => {
  vi.stubGlobal('fetch', () => Promise.resolve(response));
  const thrown = await clientFetch?.('https://api.example/organizations').catch((error: unknown) => error);
  expect(thrown).toBeInstanceOf(ApiError);
  return thrown as InstanceType<typeof ApiError>;
};

describe('API client error responses', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("throws the API's own error body as it is", async () => {
    const body = { name: 'Server error', message: 'Internal server error', type: 'server_error', status: 500, severity: 'error', requestId: 'req-1' };
    const error = await failWith(Response.json(body, { status: 500 }));

    expect(error).toMatchObject(body);
  });

  it("throws an ApiError typed by its status for a response without the API's error body: a proxy's page, none, or foreign JSON", async () => {
    for (const status of [502, 503, 504]) {
      const error = await failWith(new Response('<html><body>Bad Gateway</body></html>', { status }));
      expect(error, String(status)).toMatchObject({ status, type: 'service_unavailable', severity: 'error' });
    }

    expect(await failWith(new Response('', { status: 500 }))).toMatchObject({ status: 500, type: 'server_error', severity: 'error' });

    const notFound = await failWith(new Response('Not Found', { status: 404 }));
    expect(notFound).toMatchObject({ status: 404, severity: 'warn' });
    expect(notFound.type).toBeUndefined();

    const foreign = await failWith(Response.json({ error: 'upstream' }, { status: 502 }));
    expect(foreign).toMatchObject({ status: 502, type: 'service_unavailable' });
  });

  // The consent page sends a 401 to sign-in: the details route answers it with its details object, which has no type.
  it('reads a failed consent request the same way, keeping the status of a body without a type', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('<html><body>Bad Gateway</body></html>', { status: 502 })));
    await expect(getConsentDetails('uid-1')).rejects.toMatchObject({ status: 502, type: 'service_unavailable' });

    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ client: { id: 'client-1' } }, { status: 401 })));
    await expect(getConsentDetails('uid-1')).rejects.toMatchObject({ status: 401 });
  });
});
