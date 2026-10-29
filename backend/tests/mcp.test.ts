import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getMcpProtectedResourceMetadata, handleMcp } from 'sdk';
import { appConfig } from 'shared';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildInsertableProduct } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { mcpInitialScope, resourceUri } from '#/modules/oauth-server/resources';
import { adminRole, defaultHeaders } from './fixtures';
import { adminDb, createTestOrganization } from './helpers';
import { insertAttachmentRow, seedAttachmentHome } from './hierarchy-helpers';
import {
  authorizationCodeToken,
  bearerHeaders,
  clientCredentialsToken,
  installApp,
  registerApp,
  serviceAccountWithKey,
  startTestOauthServer,
  type TestOauthServer,
} from './oauth-helpers';
import { clearSecurityTestData, createFactorOrgUser } from './security/helpers';
import { createAppClient } from './test-client';

type Rpc = { jsonrpc: '2.0'; id: number | null; result?: Record<string, unknown>; error?: { code: number; message: string; data?: unknown } };
type ToolResult = { content: { type: string; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };

/** Every limiter passes, as in every test, and counts the requests it charges by its key. */
const charged = vi.hoisted(() => new Map<string, number>());
vi.mock('#/middlewares/rate-limiter/core', () => ({
  rateLimiter: (mode: string, key: string) =>
    Object.assign(
      async (_ctx: unknown, next: () => Promise<void>) => {
        charged.set(key, (charged.get(key) ?? 0) + 1);
        await next();
      },
      { keyPrefix: `${key}_${mode}`, buckets: [] },
    ),
}));

const REDIRECT_URI = 'http://localhost:9999/callback';

const CLIENT_ID = 'test-portfolio';

describe('MCP on the substrate (Phase E)', async () => {
  const call = await createAppClient();
  let as: TestOauthServer;
  let rpcId = 0;

  beforeAll(async () => {
    as = await startTestOauthServer();
  });
  afterAll(async () => await as.close());
  afterEach(async () => await clearSecurityTestData());

  /** An organization with its admin; `plan` is where attachments live, which a write token needs no read scope on. */
  async function orgWithAdmin() {
    const org = await createTestOrganization();
    const user = await createFactorOrgUser(call, org.tenantId, org.id, `admin-${nanoid(8)}`, adminRole);
    const plan = await seedAttachmentHome(org, user.id);
    return { org, user, plan, headers: { ...defaultHeaders, Cookie: user.sessionCookie } };
  }

  /** An attachment row in the organization's home: a machine uploads no files, so the rows its tools touch come from users. */
  async function insertAttachment(ctx: { org: { tenantId: string }; plan: TestEntityHierarchyPlan }, name: string, createdBy: string) {
    const id = generateId();
    const columns = { id, name, tenantId: ctx.org.tenantId, ...ctx.plan.channelIdColumns, createdBy, updatedBy: null, deletedBy: null };
    await insertAttachmentRow(buildInsertableProduct('attachment', columns, id));
    return id;
  }

  /** A service account plus a token for the organization's MCP resource, scoped as asked. */
  async function serviceToken(scope: string) {
    const ctx = await orgWithAdmin();
    const client = await serviceAccountWithKey(ctx.org, ctx.user.sessionCookie);
    const resource = resourceUri({ face: 'mcp', tenantId: ctx.org.tenantId, organizationId: ctx.org.id });
    const { status, body } = await clientCredentialsToken(as.issuer, client, { scope, resource });
    expect(status).toBe(200);
    return { ...ctx, accountId: client.clientId, jwt: String(body.access_token), resource };
  }

  /** A registered public app, installed in the tenant, and a user token obtained through consent. */
  async function userToken(scope: string, ctx?: Awaited<ReturnType<typeof orgWithAdmin>>) {
    const owner = ctx ?? (await orgWithAdmin());
    await registerApp({ id: CLIENT_ID, name: 'Portfolio', redirectUris: [REDIRECT_URI] });
    await installApp(owner.org, owner.user.sessionCookie, CLIENT_ID);

    const resource = resourceUri({ face: 'mcp', tenantId: owner.org.tenantId, organizationId: owner.org.id });
    const result = await authorizationCodeToken(as.issuer, {
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      scope,
      resource,
      sessionCookie: owner.user.sessionCookie,
    });
    expect(result.status).toBe(200);
    return { ...owner, jwt: String(result.body.access_token), consent: result.consent, resource };
  }

  async function rpc(ctx: { org: { tenantId: string; id: string }; jwt?: string }, method: string, params?: unknown) {
    const id = ++rpcId;
    const { response, data, error } = await call(handleMcp, {
      path: { tenantId: ctx.org.tenantId, organizationId: ctx.org.id },
      body: { jsonrpc: '2.0', id, method, params },
      headers: ctx.jwt ? bearerHeaders(ctx.jwt) : { 'Content-Type': 'application/json' },
    });
    // Non-2xx bodies land in `error`; a 403 still carries a JSON-RPC body.
    return { response, rpc: (data ?? error) as Rpc };
  }

  const toolCall = (ctx: Parameters<typeof rpc>[0], name: string, args: unknown) => rpc(ctx, 'tools/call', { name, arguments: args });
  const toolResult = (reply: { rpc: Rpc }) => reply.rpc.result as ToolResult;

  it('publishes protected resource metadata and must name only read scopes in the challenge, so a client starts minimal', async () => {
    const { org } = await orgWithAdmin();
    const metadata = await call(getMcpProtectedResourceMetadata, {
      path: { tenantId: org.tenantId, organizationId: org.id },
      headers: defaultHeaders,
    });
    expect(metadata.response.status).toBe(200);
    const resource = resourceUri({ face: 'mcp', tenantId: org.tenantId, organizationId: org.id });
    expect(metadata.data).toMatchObject({
      resource,
      authorization_servers: [appConfig.oauthUrl],
      scopes_supported: expect.arrayContaining(['attachment:read', 'attachment:write']),
    });

    const anonymous = await rpc({ org }, 'initialize');
    expect(anonymous.response.status).toBe(401);
    expect(anonymous.response.headers.get('www-authenticate')).toBe(
      `Bearer resource_metadata="${resource}/.well-known/oauth-protected-resource", scope="${mcpInitialScope}"`,
    );
  });

  it('showcase 1: a read token lists and reads attachments, and is stepped up on a write', async () => {
    const ctx = await serviceToken('attachment:read');
    const init = await rpc(ctx, 'initialize', { protocolVersion: '2026-07-28' });
    expect(init.rpc.result).toMatchObject({ protocolVersion: '2026-07-28', capabilities: { tools: {} } });

    const list = await rpc(ctx, 'tools/list');
    const tools = (list.rpc.result as { tools: { name: string; _meta: { scope: string } }[] }).tools;
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['getAttachments', 'getAttachment', 'updateAttachment', 'deleteAttachments']),
    );

    // An integer query param takes a number; the call writes it into the query string.
    const read = await toolCall(ctx, 'getAttachments', { limit: 5 });
    expect(read.response.status).toBe(200);
    expect(toolResult(read).structuredContent).toMatchObject({ items: [], total: 0 });

    const write = await toolCall(ctx, 'updateAttachment', { id: '00000000-0000-4000-8000-000000000000', ops: { name: 'x' } });
    expect(write.response.status).toBe(403);
    expect(write.response.headers.get('www-authenticate')).toContain('error="insufficient_scope", scope="attachment:write"');
    expect(write.rpc.error).toMatchObject({ message: 'insufficient_scope', data: { scope: 'attachment:write' } });
  });

  it('answers each call of a batch, one outside the token scopes with its own error', async () => {
    const ctx = await serviceToken('attachment:read');
    const write = { name: 'updateAttachment', arguments: { id: '00000000-0000-4000-8000-000000000000', ops: { name: 'x' } } };
    const { response, data } = await call(handleMcp, {
      path: { tenantId: ctx.org.tenantId, organizationId: ctx.org.id },
      body: [
        { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'getAttachments', arguments: {} } },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: write },
        { jsonrpc: '2.0', id: 3 },
        { jsonrpc: '2.0', id: 4, result: {} },
      ],
      headers: bearerHeaders(ctx.jwt),
    });

    // Answered as one 403, the read's result was lost and a client retrying the batch ran it again.
    expect(response.status).toBe(200);
    expect(response.headers.get('www-authenticate')).toContain('error="insufficient_scope", scope="attachment:write"');
    const [read, refused, invalid, ...rest] = data as Rpc[];
    expect(read).toMatchObject({ id: 1, result: { structuredContent: { items: [], total: 0 } } });
    expect(refused).toMatchObject({ id: 2, error: { code: -32002, message: 'insufficient_scope', data: { scope: 'attachment:write' } } });
    // A message without a method keeps its id; a response the client posts back gets no answer.
    expect(invalid).toMatchObject({ id: 3, error: { code: -32600 } });
    expect(rest).toEqual([]);
  });

  it('counts a tool call once against the burst limit, at the route it runs', async () => {
    const ctx = await serviceToken('attachment:read');
    charged.clear();

    // The endpoint's own requests have a bucket of their own.
    expect((await rpc(ctx, 'tools/list')).response.status).toBe(200);
    expect(Object.fromEntries(charged)).toEqual({ mcpRequest: 1 });

    // The route charges what a REST request with the same token is charged: the burst once, plus its own limiters.
    expect((await toolCall(ctx, 'getAttachments', {})).response.status).toBe(200);
    expect(Object.fromEntries(charged)).toEqual({ mcpRequest: 2, serviceBurst: 1, syncRead: 1 });
  });

  it('showcase 3: a service account reads, renames and deletes through the same tools', async () => {
    const ctx = await serviceToken('attachment:write');
    const id = await insertAttachment(ctx, 'Build log', ctx.accountId);
    // Provenance is the actor id; the wire shape hydrates users only (service badges are a UI follow-up).
    const provenance = async () => (await adminDb.select().from(attachmentsTable).where(eq(attachmentsTable.id, id)))[0];

    // `write` implies `read` (D2).
    const read = await toolCall(ctx, 'getAttachment', { id });
    expect(toolResult(read).structuredContent).toMatchObject({ id, name: 'Build log' });

    const renamed = await toolCall(ctx, 'updateAttachment', { id, ops: { name: 'Build log (main)' } });
    expect(toolResult(renamed).structuredContent).toMatchObject({ name: 'Build log (main)' });
    expect((await provenance()).updatedBy).toBe(ctx.accountId);

    const deleted = await toolCall(ctx, 'deleteAttachments', { ids: [id] });
    expect(toolResult(deleted).structuredContent).toMatchObject({ rejectedIds: [] });
    const row = await provenance();
    expect(row.deletedAt).not.toBeNull();
    expect(row.deletedBy).toBe(ctx.accountId);
  });

  it('showcase 2: a person consents to a registered app, is refused a rename, steps up and renames as themselves', async () => {
    const reader = await userToken('attachment:read');
    expect(reader.consent).toMatchObject({ client: { id: CLIENT_ID, kind: 'registered' }, scopes: ['attachment:read'], refusal: null });

    const seed = await serviceToken('attachment:write');
    const thesisId = await insertAttachment(seed, 'Thesis', seed.user.id);

    // The reader is in another tenant: the token's audience refuses this organization outright.
    const wrongTenant = await toolCall({ org: seed.org, jwt: reader.jwt }, 'getAttachments', {});
    expect(wrongTenant.response.status).toBe(401);

    const list = await toolCall(reader, 'getAttachments', {});
    expect(list.response.status).toBe(200);

    const refused = await toolCall(reader, 'updateAttachment', { id: thesisId, ops: { name: 'Thesis v2' } });
    expect(refused.response.status).toBe(403);
    expect(refused.response.headers.get('www-authenticate')).toContain('scope="attachment:write"');

    // Step up: the same person consents again with the write scope; the grant widens, the write lands as them.
    const writer = await userToken('attachment:read attachment:write', reader);
    const moved = await toolCall({ org: seed.org, jwt: seed.jwt }, 'getAttachment', { id: thesisId });
    expect(moved.response.status).toBe(200);
    const draftId = await insertAttachment(writer, 'Draft', writer.user.id);
    const renamed = await toolCall(writer, 'updateAttachment', { id: draftId, ops: { name: 'Draft v2' } });
    expect(renamed.response.status).toBe(200);
    expect(toolResult(renamed).structuredContent).toMatchObject({ name: 'Draft v2' });
    const [row] = await adminDb.select().from(attachmentsTable).where(eq(attachmentsTable.id, draftId));
    expect(row.updatedBy).toBe(writer.user.id);
  });
});
