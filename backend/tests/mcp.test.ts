import { eq } from 'drizzle-orm';
import { createServiceAccount, getProtectedResourceMetadata, handleMcp } from 'sdk';
import { appConfig } from 'shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { clientsTable } from '#/modules/oauth-server/clients-db';
import { oidcPayloadsTable } from '#/modules/oauth-server/oidc-payloads-db';
import { resourceUri } from '#/modules/oauth-server/resources';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { defaultHeaders } from './fixtures';
import { createTestOrganization } from './helpers';
import {
  authorizationCodeToken,
  clientCredentialsToken,
  startTestOauthServer,
  type TestOauthServer,
} from './oauth-helpers';
import { clearSecurityTestData, createOrgUser } from './security/helpers';
import { createAppClient } from './test-client';

type Rpc = {
  jsonrpc: '2.0';
  id: number | null;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: unknown };
};
type ToolResult = {
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

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
  afterEach(async () => {
    await db.delete(oidcPayloadsTable);
    await db.delete(clientsTable);
    await clearSecurityTestData();
  });

  async function orgWithAdmin() {
    const org = await createTestOrganization();
    const user = await createOrgUser(call, org.tenantId, org.id, `admin-${Date.now()}`, 'admin');
    return { org, user, headers: { ...defaultHeaders, Cookie: user.sessionCookie } };
  }

  /** A service account plus a token for the organization's MCP resource, scoped as asked. */
  async function serviceToken(scope: string) {
    const ctx = await orgWithAdmin();
    const { data } = await call(createServiceAccount, {
      path: { tenantId: ctx.org.tenantId, organizationId: ctx.org.id },
      body: { name: 'CI bot', role: 'admin', key: { name: 'ci', scopes: null } },
      headers: ctx.headers,
    });
    const created = data as { serviceAccount: { id: string }; credential: { secret: string } };
    const resource = resourceUri({ face: 'mcp', tenantId: ctx.org.tenantId, organizationId: ctx.org.id });
    const { status, body } = await clientCredentialsToken(
      as.issuer,
      { clientId: created.serviceAccount.id, clientSecret: created.credential.secret },
      { scope, resource },
    );
    expect(status).toBe(200);
    return { ...ctx, accountId: created.serviceAccount.id, jwt: String(body.access_token), resource };
  }

  /** A registered public app, installed in the tenant, and a user token obtained through consent. */
  async function userToken(scope: string, ctx?: Awaited<ReturnType<typeof orgWithAdmin>>) {
    const owner = ctx ?? (await orgWithAdmin());
    await db
      .insert(clientsTable)
      .values({ id: CLIENT_ID, name: 'Portfolio', redirectUris: [REDIRECT_URI] })
      .onConflictDoNothing();
    const { data } = await call(createServiceAccount, {
      path: { tenantId: owner.org.tenantId, organizationId: owner.org.id },
      body: { name: 'Portfolio installation', role: 'member' },
      headers: owner.headers,
    });
    const installation = (data as { serviceAccount: { id: string } }).serviceAccount;
    await db
      .update(serviceAccountsTable)
      .set({ clientId: CLIENT_ID })
      .where(eq(serviceAccountsTable.id, installation.id));

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
      headers: { 'Content-Type': 'application/json', ...(ctx.jwt && { Authorization: `Bearer ${ctx.jwt}` }) },
    });
    // Non-2xx bodies land in `error`; a 403 still carries a JSON-RPC body.
    return { response, rpc: (data ?? error) as Rpc };
  }

  const toolCall = (ctx: Parameters<typeof rpc>[0], name: string, args: unknown) =>
    rpc(ctx, 'tools/call', { name, arguments: args });
  const toolResult = (reply: { rpc: Rpc }) => reply.rpc.result as ToolResult;

  it('publishes protected resource metadata and challenges a tokenless call with it', async () => {
    const { org } = await orgWithAdmin();
    const metadata = await call(getProtectedResourceMetadata, {
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
      `Bearer resource_metadata="${resource}/.well-known/oauth-protected-resource"`,
    );
  });

  it('showcase 1: a read token lists and reads attachments, and is stepped up on a write', async () => {
    const ctx = await serviceToken('attachment:read');
    const init = await rpc(ctx, 'initialize', { protocolVersion: '2026-07-28' });
    expect(init.rpc.result).toMatchObject({ protocolVersion: '2026-07-28', capabilities: { tools: {} } });

    const list = await rpc(ctx, 'tools/list');
    const tools = (list.rpc.result as { tools: { name: string; _meta: { scope: string } }[] }).tools;
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        'getAttachments',
        'getAttachment',
        'createAttachments',
        'updateAttachment',
        'deleteAttachments',
      ]),
    );

    const read = await toolCall(ctx, 'getAttachments', { limit: 5 });
    expect(read.response.status).toBe(200);
    expect(toolResult(read).structuredContent).toMatchObject({ items: [], total: 0 });

    const write = await toolCall(ctx, 'updateAttachment', { id: '00000000-0000-4000-8000-000000000000', name: 'x' });
    expect(write.response.status).toBe(403);
    expect(write.response.headers.get('www-authenticate')).toContain(
      'error="insufficient_scope", scope="attachment:write"',
    );
    expect(write.rpc.error).toMatchObject({ message: 'insufficient_scope', data: { scope: 'attachment:write' } });
  });

  it('showcase 3: a service account creates, reads, renames and deletes through the same tools', async () => {
    const ctx = await serviceToken('attachment:write');
    const created = await toolCall(ctx, 'createAttachments', {
      items: [
        {
          name: 'Build log',
          filename: 'build.log',
          contentType: 'text/plain',
          size: 1234,
          key: 'uploads/ci/build.log',
        },
      ],
    });
    expect(created.response.status).toBe(200);
    const result = created.rpc.result as ToolResult;
    expect(result.isError).toBeUndefined();
    const { items } = result.structuredContent as { items: { id: string; name: string }[] };
    expect(items).toHaveLength(1);
    // Provenance is the principal id; the wire shape hydrates users only (service badges are a UI follow-up).
    const provenance = async (id: string) =>
      (await db.select().from(attachmentsTable).where(eq(attachmentsTable.id, id)))[0];
    expect((await provenance(items[0].id)).createdBy).toBe(ctx.accountId);

    // `write` implies `read` (D2).
    const read = await toolCall(ctx, 'getAttachment', { id: items[0].id });
    expect(toolResult(read).structuredContent).toMatchObject({
      id: items[0].id,
      name: 'Build log',
      descriptionText: '',
    });

    const renamed = await toolCall(ctx, 'updateAttachment', { id: items[0].id, name: 'Build log (main)' });
    expect(toolResult(renamed).structuredContent).toMatchObject({ name: 'Build log (main)' });
    expect((await provenance(items[0].id)).updatedBy).toBe(ctx.accountId);

    const deleted = await toolCall(ctx, 'deleteAttachments', { ids: [items[0].id] });
    expect(toolResult(deleted).structuredContent).toMatchObject({ rejectedIds: [] });
    const row = await provenance(items[0].id);
    expect(row.deletedAt).not.toBeNull();
    expect(row.deletedBy).toBe(ctx.accountId);
  });

  it('showcase 2: a person consents to a registered app, is refused a rename, steps up and renames as themselves', async () => {
    const reader = await userToken('attachment:read');
    expect(reader.consent).toMatchObject({
      client: { id: CLIENT_ID, kind: 'registered' },
      scopes: ['attachment:read'],
      refusal: null,
    });

    const seed = await serviceToken('attachment:write');
    const created = await toolCall(seed, 'createAttachments', {
      items: [
        {
          name: 'Thesis',
          filename: 'thesis.pdf',
          contentType: 'application/pdf',
          size: 99,
          key: 'uploads/t/thesis.pdf',
        },
      ],
    });
    const { items } = toolResult(created).structuredContent as { items: { id: string }[] };

    // The reader is in another tenant: the token's audience refuses this organization outright.
    const wrongTenant = await toolCall({ org: seed.org, jwt: reader.jwt }, 'getAttachments', {});
    expect(wrongTenant.response.status).toBe(401);

    const list = await toolCall(reader, 'getAttachments', {});
    expect(list.response.status).toBe(200);

    const refused = await toolCall(reader, 'updateAttachment', { id: items[0].id, name: 'Thesis v2' });
    expect(refused.response.status).toBe(403);
    expect(refused.response.headers.get('www-authenticate')).toContain('scope="attachment:write"');

    // Step up: the same person consents again with the write scope; the grant widens, the write lands as them.
    const writer = await userToken('attachment:read attachment:write', reader);
    const moved = await toolCall({ org: seed.org, jwt: seed.jwt }, 'getAttachment', { id: items[0].id });
    expect(moved.response.status).toBe(200);
    const own = await toolCall(writer, 'createAttachments', {
      items: [
        { name: 'Draft', filename: 'draft.pdf', contentType: 'application/pdf', size: 10, key: 'uploads/u/draft.pdf' },
      ],
    });
    const mine = (toolResult(own).structuredContent as { items: { id: string }[] }).items[0];
    const renamed = await toolCall(writer, 'updateAttachment', { id: mine.id, name: 'Draft v2' });
    expect(renamed.response.status).toBe(200);
    expect(toolResult(renamed).structuredContent).toMatchObject({ name: 'Draft v2' });
    const [row] = await db.select().from(attachmentsTable).where(eq(attachmentsTable.id, mine.id));
    expect(row.createdBy).toBe(writer.user.id);
    expect(row.updatedBy).toBe(writer.user.id);
  });
});
