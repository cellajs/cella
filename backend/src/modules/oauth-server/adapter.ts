import { and, eq } from 'drizzle-orm';
import type { Adapter, AdapterPayload } from 'oidc-provider';
import { baseDb } from '#/db/db';
import { clientsTable } from '#/modules/oauth-server/clients-db';
import { oidcPayloadsTable } from '#/modules/oauth-server/oidc-payloads-db';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { getIsoDate } from '#/utils/iso-date';

/** Client metadata as the provider reads it; `client_kind` tells the consent screen and the secret check which table it came from. */
export type AppClientMetadata = AdapterPayload & { client_kind: 'registered' | 'service' };

async function findClient(id: string): Promise<AppClientMetadata | undefined> {
  const [app] = await baseDb.select().from(clientsTable).where(eq(clientsTable.id, id)).limit(1);
  if (app) {
    return {
      client_id: app.id,
      client_name: app.name,
      client_secret: app.secretHash ?? undefined,
      token_endpoint_auth_method: app.secretHash ? 'client_secret_basic' : 'none',
      grant_types: app.secretHash
        ? ['authorization_code', 'refresh_token', 'client_credentials']
        : ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      redirect_uris: app.redirectUris,
      logo_uri: app.logoUri ?? undefined,
      client_uri: app.clientUri ?? undefined,
      policy_uri: app.policyUri ?? undefined,
      client_kind: 'registered',
    };
  }
  // A service account is its own client_credentials client; its secret keys are the client secrets (compared by hash).
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
 * `node-oidc-provider`'s adapter over `oidc_payloads`: one row per model instance keyed by (type, id). The `Client`
 * model reads the app's own tables (`clients`, active `service_accounts`). Expiry is a column, so a sweep can delete
 * what the provider no longer reads.
 */
export class DrizzleAdapter implements Adapter {
  constructor(private readonly name: string) {}

  async upsert(id: string, payload: AdapterPayload, expiresIn?: number): Promise<void> {
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
    const row = {
      type: this.name,
      id,
      payload,
      grantId: (payload.grantId as string | undefined) ?? null,
      userCode: (payload.userCode as string | undefined) ?? null,
      uid: (payload.uid as string | undefined) ?? null,
      expiresAt,
    };
    await baseDb
      .insert(oidcPayloadsTable)
      .values(row)
      .onConflictDoUpdate({
        target: [oidcPayloadsTable.type, oidcPayloadsTable.id],
        set: { ...row, consumedAt: null },
      });
  }

  async find(id: string): Promise<AdapterPayload | undefined> {
    if (this.name === 'Client') return findClient(id);
    const [row] = await baseDb
      .select()
      .from(oidcPayloadsTable)
      .where(and(eq(oidcPayloadsTable.type, this.name), eq(oidcPayloadsTable.id, id)))
      .limit(1);
    return row ? toPayload(row) : undefined;
  }

  async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    const [row] = await baseDb
      .select()
      .from(oidcPayloadsTable)
      .where(and(eq(oidcPayloadsTable.type, this.name), eq(oidcPayloadsTable.uid, uid)))
      .limit(1);
    return row ? toPayload(row) : undefined;
  }

  async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
    const [row] = await baseDb
      .select()
      .from(oidcPayloadsTable)
      .where(and(eq(oidcPayloadsTable.type, this.name), eq(oidcPayloadsTable.userCode, userCode)))
      .limit(1);
    return row ? toPayload(row) : undefined;
  }

  async consume(id: string): Promise<void> {
    await baseDb
      .update(oidcPayloadsTable)
      .set({ consumedAt: getIsoDate() })
      .where(and(eq(oidcPayloadsTable.type, this.name), eq(oidcPayloadsTable.id, id)));
  }

  async destroy(id: string): Promise<void> {
    await baseDb
      .delete(oidcPayloadsTable)
      .where(and(eq(oidcPayloadsTable.type, this.name), eq(oidcPayloadsTable.id, id)));
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
