import { type Client, createClient, createConfig } from 'sdk/client';

type AppLike = { fetch: (req: Request) => Response | Promise<Response> };

/**
 * Return type for SDK calls in tests (with throwOnError: false, responseStyle: 'fields').
 * Gives access to data, error, and the raw Response for status/header checks.
 */
export type TestResult<TData = unknown, TError = unknown> =
  | { data: TData; error: undefined; request: Request; response: Response }
  | { data: undefined; error: TError; request: Request; response: Response };

/**
 * Creates an SDK client wired to Hono's in-process app.fetch().
 * All requests run in-process — no HTTP server needed.
 */
export function createTestClient(app: AppLike): Client {
  return createClient(
    createConfig({
      baseUrl: 'http://localhost',
      fetch: ((req: Request | string | URL) => app.fetch(req as Request)) as typeof fetch,
    }),
  );
}

/**
 * Calls an SDK function in test mode, returning { data, error, response }.
 * Injects the test client, disables throwOnError, and sets responseStyle to 'fields'.
 * Input options are type-checked against the SDK function's signature.
 */
export function sdk(client: Client) {
  return async <F extends (opts: any) => Promise<any>>(
    fn: F,
    opts: Omit<Parameters<F>[0], 'client' | 'throwOnError' | 'responseStyle'>,
  ): Promise<TestResult> => {
    return fn({ ...opts, client, throwOnError: false, responseStyle: 'fields' }) as Promise<TestResult>;
  };
}

/**
 * Create an SDK test client from the app routes.
 * Defers the import so mocks are set up first.
 */
export async function createAppClient() {
  const { default: app } = await import('#/routes');
  return sdk(createTestClient(app));
}
