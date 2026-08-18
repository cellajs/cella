import { type Client, createClient, createConfig } from 'sdk/client';

type AppLike = { fetch: (req: Request) => Response | Promise<Response> };

/** SDK call result under throwOnError: false and responseStyle: 'fields'. */
export type TestResult<TData = unknown, TError = unknown> =
  | { data: TData; error: undefined; request: Request; response: Response }
  | { data: undefined; error: TError; request: Request; response: Response };

/** SDK client wired to Hono's in-process app.fetch(); no HTTP server. */
export function createTestClient(app: AppLike): Client {
  return createClient(
    createConfig({
      baseUrl: 'http://localhost',
      fetch: ((req: Request | string | URL) => app.fetch(req as Request)) as typeof fetch,
    }),
  );
}

/** Injects the test client with throwOnError: false and responseStyle: 'fields'. */
export function sdk(client: Client) {
  return async <F extends (opts: any) => Promise<any>>(
    fn: F,
    opts: Omit<Parameters<F>[0], 'client' | 'throwOnError' | 'responseStyle'>,
  ): Promise<TestResult> => {
    return fn({ ...opts, client, throwOnError: false, responseStyle: 'fields' }) as Promise<TestResult>;
  };
}

/** The route import is deferred so mocks are set up first. */
export async function createAppClient() {
  const { baseApp: app } = await import('#/routes');
  return sdk(createTestClient(app));
}
