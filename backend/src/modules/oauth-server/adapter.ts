import { z } from '@hono/zod-openapi';
import { and, eq, isNull } from 'drizzle-orm';
import { type Adapter, type AdapterPayload, errors } from 'oidc-provider';
import { baseDb } from '#/db/db';
import { clientCache } from '#/modules/oauth-server/client-cache';
import { oauthClientsTable } from '#/modules/oauth-server/oauth-clients-db';
import { oidcPayloadsTable } from '#/modules/oauth-server/oidc-payloads-db';
import { revokeGrant } from '#/modules/oauth-server/revoke-grant';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { hashToken } from '#/utils/hash-token';
import { getIsoDate } from '#/utils/iso-date';

/** Client metadata as the provider reads it; `client_kind` tells the secret check and the scope cap which table it came from. */
export type AppClientMetadata = AdapterPayload & { client_kind: 'registered' | 'service' };

async function findClient(id: string): Promise<AppClientMetadata | undefined> {
  const cached = clientCache.get(id);
  if (cached) return cached;
  const client = await loadClient(id);
  if (client) clientCache.set(id, client);
  return client;
}

async function loadClient(id: string): Promise<AppClientMetadata | undefined> {
  const [app] = await baseDb.select().from(oauthClientsTable).where(eq(oauthClientsTable.id, id)).limit(1);
  if (app) {
    return {
      client_id: app.id,
      client_name: app.name,
      client_secret: app.secretHash ?? undefined,
      token_endpoint_auth_method: app.secretHash ? 'client_secret_basic' : 'none',
      // A registered app acts for the people who consent to it; only a service account acts on its own.
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      redirect_uris: app.redirectUris,
      logo_uri: app.logoUri ?? undefined,
      client_kind: 'registered',
    };
  }
  // A service account is its own client_credentials client; its secret keys are the client secrets (compared by hash).
  // Its id is a UUID: any other id (a metadata document URL) would make the uuid column refuse the query.
  if (!z.uuid().safeParse(id).success) return undefined;
  const [account] = await baseDb
    .select()
    .from(serviceAccountsTable)
    .where(and(eq(serviceAccountsTable.id, id), eq(serviceAccountsTable.status, 'active')))
    .limit(1);
  if (!account) return undefined;
  return {
    client_id: account.id,
    client_name: account.name,
    // A placeholder so the provider treats the client as confidential; the real check compares key hashes.
    client_secret: 'hashed',
    token_endpoint_auth_method: 'client_secret_basic',
    grant_types: ['client_credentials'],
    response_types: [],
    redirect_uris: [],
    client_kind: 'service',
  };
}

/**
 * Codes and refresh tokens are values a client presents to get tokens: their rows are keyed by the value's SHA-256 and
 * the stored payload drops `jti` (the value itself), so reading the store yields nothing a client could present.
 */
const hashedModels = new Set(['AuthorizationCode', 'RefreshToken']);

/**
 * `node-oidc-provider`'s adapter over `oidc_payloads`: one row per model instance keyed by (type, id). The `Client`
 * model reads the app's own tables (`oauth_clients`, active `service_accounts`). Expiry is a column, so a sweep can delete
 * what the provider no longer reads.
 */
export class DrizzleAdapter implements Adapter {
  private readonly hashed: boolean;

  constructor(private readonly name: string) {
    this.hashed = hashedModels.has(name);
  }

  private rowId(id: string): string {
    return this.hashed ? hashToken(id) : id;
  }

  async upsert(id: string, payload: AdapterPayload, expiresIn?: number): Promise<void> {
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
    const { jti: _value, ...withoutValue } = payload;
    const row = {
      type: this.name,
      id: this.rowId(id),
      payload: this.hashed ? withoutValue : payload,
      grantId: (payload.grantId as string | undefined) ?? null,
      accountId: (payload.accountId as string | undefined) ?? null,
      uid: (payload.uid as string | undefined) ?? null,
      expiresAt,
    };
    // A save over an existing row leaves `consumedAt` alone: what was spent stays spent.
    await baseDb
      .insert(oidcPayloadsTable)
      .values(row)
      .onConflictDoUpdate({ target: [oidcPayloadsTable.type, oidcPayloadsTable.id], set: row });
  }

  async find(id: string): Promise<AdapterPayload | undefined> {
    if (this.name === 'Client') return findClient(id);
    const [row] = await baseDb
      .select()
      .from(oidcPayloadsTable)
      .where(and(eq(oidcPayloadsTable.type, this.name), eq(oidcPayloadsTable.id, this.rowId(id))))
      .limit(1);
    if (!row) return undefined;
    return this.hashed ? { ...toPayload(row), jti: id } : toPayload(row);
  }

  async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    const [row] = await baseDb
      .select()
      .from(oidcPayloadsTable)
      .where(and(eq(oidcPayloadsTable.type, this.name), eq(oidcPayloadsTable.uid, uid)))
      .limit(1);
    return row ? toPayload(row) : undefined;
  }

  /** Device authorization is not enabled, so no row ever carries a user code. */
  async findByUserCode(_userCode: string): Promise<AdapterPayload | undefined> {
    return undefined;
  }

  /**
   * Spends a code, refresh token or pushed request once. The provider checks `consumed` on the row it read before it
   * consumes, so two concurrent requests can both pass that check: only the one whose update finds the row unspent
   * wins, and the other is a replay. As for a code used twice, a replay revokes the grant with every token issued
   * under it.
   */
  async consume(id: string): Promise<void> {
    const rowId = this.rowId(id);
    const [spent] = await baseDb
      .update(oidcPayloadsTable)
      .set({ consumedAt: getIsoDate() })
      .where(
        and(
          eq(oidcPayloadsTable.type, this.name),
          eq(oidcPayloadsTable.id, rowId),
          isNull(oidcPayloadsTable.consumedAt),
        ),
      )
      .returning({ id: oidcPayloadsTable.id });
    if (spent) return;

    const [replayed] = await baseDb
      .select({ grantId: oidcPayloadsTable.grantId })
      .from(oidcPayloadsTable)
      .where(and(eq(oidcPayloadsTable.type, this.name), eq(oidcPayloadsTable.id, rowId)))
      .limit(1);
    if (replayed?.grantId) await revokeGrant({ var: { db: baseDb } }, { grantId: replayed.grantId });
    throw new errors.InvalidGrant(`${this.name} already consumed`);
  }

  /** A grant the provider deletes itself (a revoked refresh token, a replayed code) takes its tokens' verdicts along. */
  async destroy(id: string): Promise<void> {
    if (this.name === 'Grant') return revokeGrant({ var: { db: baseDb } }, { grantId: id, withTokens: false });
    await baseDb
      .delete(oidcPayloadsTable)
      .where(and(eq(oidcPayloadsTable.type, this.name), eq(oidcPayloadsTable.id, this.rowId(id))));
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    await baseDb
      .delete(oidcPayloadsTable)
      .where(and(eq(oidcPayloadsTable.type, this.name), eq(oidcPayloadsTable.grantId, grantId)));
  }
}

function toPayload(row: typeof oidcPayloadsTable.$inferSelect): AdapterPayload {
  return {
    ...row.payload,
    ...(row.consumedAt && { consumed: Math.floor(new Date(row.consumedAt).getTime() / 1000) }),
  };
}
