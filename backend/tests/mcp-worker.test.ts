import { getMcpProtectedResourceMetadata } from 'sdk';
import { appConfig } from 'shared';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { otel } from '#/lib/tracing';
import { resourceUri } from '#/modules/oauth-server/resources';
import { defaultHeaders } from './fixtures';
import { createTestOrganization } from './helpers';
import { createTestClient, sdk } from './test-client';

type Fetch = (request: Request) => Response | Promise<Response>;

/** What the worker hands `serve` and its shutdown hook, so the test opens no port and stops what the worker starts. */
const worker = vi.hoisted(() => ({ fetch: undefined as Fetch | undefined, cleanup: undefined as (() => Promise<void>) | undefined }));

vi.mock('@hono/node-server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@hono/node-server')>()),
  serve: vi.fn(({ fetch }: { fetch: Fetch }) => {
    worker.fetch = fetch;
    return { close: () => {} };
  }),
}));
vi.mock('shared/utils/worker-lifecycle', () => ({
  setupGracefulShutdown: vi.fn(({ cleanup }: { cleanup: () => Promise<void> }) => {
    worker.cleanup = cleanup;
  }),
}));
// The worker starts telemetry; a test exports none.
vi.mock('#/lib/tracing', async (importOriginal) => {
  const { otel } = await importOriginal<typeof import('#/lib/tracing')>();
  return {
    otel: { ...otel, start: vi.fn(), verifyConnection: vi.fn(async () => {}), shutdown: vi.fn(async () => {}) },
  };
});

/**
 * Under singleVM the API process starts the MCP worker once it listens, so the API may have answered a request by
 * then. Hono takes no routes after its first request, so the worker serves an app of its own.
 */
describe('MCP worker folded into the API process', () => {
  afterAll(async () => await worker.cleanup?.());

  it('serves the MCP routes after the API has answered a request', async () => {
    const { baseApp } = await import('#/routes');
    await baseApp.request('/health', { headers: defaultHeaders });

    const { startMcpWorker } = await import('#/modules/mcp/worker/mcp-worker-entry');
    await startMcpWorker({ port: appConfig.devPorts.mcp, inProcess: true });
    // The API process owns telemetry
    expect(otel.start).not.toHaveBeenCalled();

    const org = await createTestOrganization();
    const call = sdk(createTestClient({ fetch: worker.fetch as Fetch }));
    const { data, response } = await call(getMcpProtectedResourceMetadata, {
      path: { tenantId: org.tenantId, organizationId: org.id },
      headers: defaultHeaders,
    });
    expect(response.status).toBe(200);
    expect(data).toMatchObject({ resource: resourceUri({ face: 'mcp', tenantId: org.tenantId, organizationId: org.id }) });
  });
});
