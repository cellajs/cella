import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createServiceAccount, getMcpProtectedResourceMetadata, handleMcp } from 'sdk';
import { appConfig, hierarchy } from 'shared';
import { buildTestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db, getAdminDb } from '#/db/db';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { oauthClientsTable } from '#/modules/oauth-server/oauth-clients-db';
import { resourceUri } from '#/modules/oauth-server/resources';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { defaultHeaders } from './fixtures';
import { createTestOrganization } from './helpers';
import { seedEntityHierarchy } from './hierarchy-helpers';
import {
  authorizationCodeToken,
  clientCredentialsToken,
  startTestOauthServer,
  type TestOauthServer,
} from './oauth-helpers';
import { clearSecurityTestData, createOrgUser } from './security/helpers';
import { createAppClient } from './test-client';

// Attachments sit behind tenant RLS, so assertions read them as admin; under TEST_DB_ROLE=runtime `db` sees none.
const adminDb = getAdminDb('test assertions');

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

/** A create item as the route's body schema reads it (the sync transaction is added server-side), keyed under the org's upload prefix. */
const buildItem = (name: string, filename: string, ctx: { home: Record<string, string>; org: { id: string } }) => ({
  ...ctx.home,
  id: crypto.randomUUID(),
  name,
  filename,
  contentType: 'application/octet-stream',
  size: '1234',
  keys: { original: `${ctx.org.id}/uploads/${filename}` },
  bucketName: appConfig.s3.privateBucket,
  publicBucket: false,
});
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

  /**
   * The create body's home: the deepest seeded ancestor id below the organization; empty in the
   * template's org-homed default. A write token needs no `<home>:read`: placement only looks the home up.
   */
  async function seedAttachmentHome(
    org: { id: string; tenantId: string },
    createdBy: string,
  ): Promise<Record<string, string>> {
    const plan = buildTestEntityHierarchyPlan({
      entityType: 'attachment',
      organizationId: org.id,
      makeChannelId: () => generateId(),
    });
    await seedEntityHierarchy(db, plan, { tenantId: org.tenantId, createdBy, slugPrefix: `mcp-${nanoid(6)}` });
    const deepest = hierarchy
      .getOrderedAncestors('attachment')
      .find((type) => type !== 'organization' && plan.channelIdColumns[appConfig.entityIdColumnKeys[type]]);
    if (!deepest) return {};
    const key = appConfig.entityIdColumnKeys[deepest];
    return { [key]: plan.channelIdColumns[key] };
  }

  async function orgWithAdmin() {
    const org = await createTestOrganization();
    const user = await createOrgUser(call, org.tenantId, org.id, `admin-${nanoid(8)}`, 'admin');
    const home = await seedAttachmentHome(org, user.id);
    return { org, user, home, headers: { ...defaultHeaders, Cookie: user.sessionCookie } };
  }

  /** A service account plus a token for the organization's MCP resource, scoped as asked. */
  async function serviceToken(scope: string) {
    const ctx = await orgWithAdmin();
    const { data } = await call(createServiceAccount, {
      path: { tenantId: ctx.org.tenantId, organizationId: ctx.org.id },
      body: { name: 'CI bot', role: 'admin', key: { name: 'ci', scopes: null } },
      headers: ctx.headers,
    });
    const created = data as { serviceAccount: { id: string }; apiKey: { secret: string } };
    const resource = resourceUri({ face: 'mcp', tenantId: ctx.org.tenantId, organizationId: ctx.org.id });
    const { status, body } = await clientCredentialsToken(
      as.issuer,
      { clientId: created.serviceAccount.id, clientSecret: created.apiKey.secret },
      { scope, resource },
    );
    expect(status).toBe(200);
    return { ...ctx, accountId: created.serviceAccount.id, jwt: String(body.access_token), resource };
  }

  /** A registered public app, installed in the tenant, and a user token obtained through consent. */
  async function userToken(scope: string, ctx?: Awaited<ReturnType<typeof orgWithAdmin>>) {
    const owner = ctx ?? (await orgWithAdmin());
    await db
      .insert(oauthClientsTable)
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
      .set({ oauthClientId: CLIENT_ID })
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

    // Query values are strings, as the route reads them.
    const read = await toolCall(ctx, 'getAttachments', { limit: '5' });
    expect(read.response.status).toBe(200);
    expect(toolResult(read).structuredContent).toMatchObject({ items: [], total: 0 });

    const write = await toolCall(ctx, 'updateAttachment', {
      id: '00000000-0000-4000-8000-000000000000',
      ops: { name: 'x' },
    });
    expect(write.response.status).toBe(403);
    expect(write.response.headers.get('www-authenticate')).toContain(
      'error="insufficient_scope", scope="attachment:write"',
    );
    expect(write.rpc.error).toMatchObject({ message: 'insufficient_scope', data: { scope: 'attachment:write' } });
  });

  it('showcase 3: a service account creates, reads, renames and deletes through the same tools', async () => {
    const ctx = await serviceToken('attachment:write');
    const created = await toolCall(ctx, 'createAttachments', {
      items: [buildItem('Build log', 'build.log', ctx)],
    });
    expect(created.rpc.error).toBeUndefined();
    expect(created.response.status).toBe(200);
    const result = created.rpc.result as ToolResult;
    expect(result.isError).toBeUndefined();
    const { data: items } = result.structuredContent as { data: { id: string; name: string }[] };
    expect(items).toHaveLength(1);
    // Provenance is the actor id; the wire shape hydrates users only (service badges are a UI follow-up).
    const provenance = async (id: string) =>
      (await adminDb.select().from(attachmentsTable).where(eq(attachmentsTable.id, id)))[0];
    expect((await provenance(items[0].id)).createdBy).toBe(ctx.accountId);

    // `write` implies `read` (D2).
    const read = await toolCall(ctx, 'getAttachment', { id: items[0].id });
    expect(toolResult(read).structuredContent).toMatchObject({ id: items[0].id, name: 'Build log' });

    const renamed = await toolCall(ctx, 'updateAttachment', { id: items[0].id, ops: { name: 'Build log (main)' } });
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
      items: [buildItem('Thesis', 'thesis.pdf', seed)],
    });
    expect(created.rpc.error).toBeUndefined();
    const { data: items } = toolResult(created).structuredContent as { data: { id: string }[] };

    // The reader is in another tenant: the token's audience refuses this organization outright.
    const wrongTenant = await toolCall({ org: seed.org, jwt: reader.jwt }, 'getAttachments', {});
    expect(wrongTenant.response.status).toBe(401);

    const list = await toolCall(reader, 'getAttachments', {});
    expect(list.response.status).toBe(200);

    const refused = await toolCall(reader, 'updateAttachment', { id: items[0].id, ops: { name: 'Thesis v2' } });
    expect(refused.response.status).toBe(403);
    expect(refused.response.headers.get('www-authenticate')).toContain('scope="attachment:write"');

    // Step up: the same person consents again with the write scope; the grant widens, the write lands as them.
    const writer = await userToken('attachment:read attachment:write', reader);
    const moved = await toolCall({ org: seed.org, jwt: seed.jwt }, 'getAttachment', { id: items[0].id });
    expect(moved.response.status).toBe(200);
    const own = await toolCall(writer, 'createAttachments', {
      items: [buildItem('Draft', 'draft.pdf', writer)],
    });
    expect(own.rpc.error).toBeUndefined();
    expect(toolResult(own).isError).toBeUndefined();
    const mine = (toolResult(own).structuredContent as { data: { id: string }[] }).data[0];
    const renamed = await toolCall(writer, 'updateAttachment', { id: mine.id, ops: { name: 'Draft v2' } });
    expect(renamed.response.status).toBe(200);
    expect(toolResult(renamed).structuredContent).toMatchObject({ name: 'Draft v2' });
    const [row] = await adminDb.select().from(attachmentsTable).where(eq(attachmentsTable.id, mine.id));
    expect(row.createdBy).toBe(writer.user.id);
    expect(row.updatedBy).toBe(writer.user.id);
  });
});
