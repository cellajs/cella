import { afterEach, describe, expect, it, vi } from 'vitest';

const setDownAlert = vi.hoisted(() => vi.fn());

vi.mock('~/query/offline/connectivity', () => ({ reportNetworkFailure: vi.fn(), reportReachable: vi.fn() }));
vi.mock('~/modules/common/alerter/alert-store', () => ({ alertStore: { getState: () => ({ setDownAlert }) } }));

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

  it("throws the API's Problem Details body: its title as the name, its detail as the message, every other member as it is", async () => {
    const body = {
      type: 'too_many_requests',
      title: 'Too many attempts',
      status: 429,
      detail: 'Wait a moment.',
      instance: 'req-1',
      severity: 'warn',
      retryAfter: 3,
    };
    const error = await failWith(Response.json(body, { status: 429, headers: { 'Content-Type': 'application/problem+json' } }));

    const { title, detail, ...members } = body;
    expect(error).toMatchObject({ ...members, name: title, message: detail });
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

  // A sign-out during an outage said it failed and never why: it calls the SDK directly, past the query cache.
  it('raises the down alert for a service that is down, on a call outside the query cache, and clears it once the API answers', async () => {
    setDownAlert.mockClear();
    await failWith(new Response('Bad Gateway', { status: 504 }));
    expect(setDownAlert).toHaveBeenLastCalledWith(true);

    // The API's own 503 for a missing setting and any other 5xx say nothing about the service as a whole.
    setDownAlert.mockClear();
    await failWith(Response.json({ type: 'server_error', status: 503 }, { status: 503 }));
    await failWith(new Response('', { status: 500 }));
    expect(setDownAlert).not.toHaveBeenCalled();

    await failWith(new Response('Not Found', { status: 404 }));
    expect(setDownAlert).toHaveBeenLastCalledWith(false);
  });

  // The consent page sends a 401 to sign-in: the details route answers it with its details object, which has no type.
  it('reads a failed consent request the same way, keeping the status of a body without a type', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('<html><body>Bad Gateway</body></html>', { status: 502 })));
    await expect(getConsentDetails('uid-1')).rejects.toMatchObject({ status: 502, type: 'service_unavailable' });

    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ client: { id: 'client-1' } }, { status: 401 })));
    await expect(getConsentDetails('uid-1')).rejects.toMatchObject({ status: 401 });
  });
});
