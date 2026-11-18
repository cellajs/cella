import { z } from '@hono/zod-openapi';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import { decodeProtectedHeader, type JSONWebKeySet } from 'jose';
import Provider, { type Adapter, type AdapterPayload, errors } from 'oidc-provider';
import { accessScopes, isSwitchOn } from 'shared';
import { isUuid } from 'shared/utils/entity-id';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { readLtiKeySet } from '#/lib/lti-key-set';
import { findLtiInstallationByClient } from '#/modules/lti-platform/lti-platform-queries';
import { oauthClientsTable } from '#/modules/oauth-server/oauth-clients-db';
import { oidcPayloadsTable } from '#/modules/oauth-server/oidc-payloads-db';
import { revokeGrant } from '#/modules/oauth-server/revoke-grant';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { hashToken } from '#/utils/hash-token';
import { getIsoDate, isoDateIn } from '#/utils/iso-date';
import { log } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';

/** What an installed LTI tool's token rests on: its installation, the installation's tenant and the scopes an admin granted. */
const ltiInstallationMetadataSchema = z.object({ id: z.string(), tenant_id: z.string(), granted_scopes: z.array(z.enum(accessScopes.all)) });

type LtiInstallationMetadata = z.infer<typeof ltiInstallationMetadataSchema>;

/**
 * Client metadata as the provider reads it; `client_kind` names the table the adapter read the client from, and an LTI
 * registration's client carries its installation.
 */
type AppClientMetadata = AdapterPayload & { client_kind: 'registered' | 'service' | 'lti'; lti_installation?: LtiInstallationMetadata };

/** The client metadata the adapter adds: a client metadata document that sets one is refused (`allowClient` in `provider.ts`). */
export const appClientProperties = ['client_kind', 'lti_installation'] as const;

/**
 * Where a client comes from: `registered` (an `oauth_clients` row), `service` (a service account) or `lti` (an approved
 * LTI installation's registration at the token endpoint) as the adapter read it, else `unregistered`: a client
 * identified by its metadata document, which the provider marks. The secret check, the scope cap and the consent page
 * read the kind here and nowhere else.
 */
export function clientKindOf(client: object): AppClientMetadata['client_kind'] | 'unregistered' {
  if ('clientIdMetadataDocument' in client) return 'unregistered';
  const kind = 'client_kind' in client ? client.client_kind : undefined;
  return kind === 'registered' || kind === 'service' || kind === 'lti' ? kind : 'unregistered';
}

/** The installation an LTI client acts as; null for every other client. */
export function ltiInstallationOf(client: object): LtiInstallationMetadata | null {
  if (clientKindOf(client) !== 'lti' || !('lti_installation' in client)) return null;
  return ltiInstallationMetadataSchema.safeParse(client.lti_installation).data ?? null;
}

/** The signed assertion a client authenticates a token request with, else undefined: the one request an LTI registration is a client in. */
function tokenRequestAssertion(): string | undefined {
  const oidc = Provider.ctx?.oidc;
  const assertion = oidc?.route === 'token' ? oidc.params?.client_assertion : undefined;
  return typeof assertion === 'string' ? assertion : undefined;
}

/** The `kid` an assertion names; undefined for none or a value that is no JWT, which client authentication refuses. */
function kidOf(assertion: string): string | undefined {
  try {
    return decodeProtectedHeader(assertion).kid;
  } catch {
    return undefined;
  }
}

/**
 * An approved, active LTI installation's registration as a `client_credentials` client, which authenticates with
 * `private_key_jwt`. The provider never fetches an address the LTI tool supplied: the platform reads the key set it
 * registered through the guarded fetch and hands the keys over inline. An unreadable set leaves no key, and client
 * authentication fails.
 */
async function findLtiTokenClient(id: string, assertion: string): Promise<AppClientMetadata | undefined> {
  if (!isSwitchOn({ feature: 'ltiPlatform' })) return undefined;
  const found = await findLtiInstallationByClient({ var: { db: baseDb } }, { clientId: id });
  if (!found?.installation.approvedAt || found.account.status !== 'active' || !found.client.jwksUri) return undefined;

  const owner = { id, jwksUri: found.client.jwksUri, meta: { clientId: id } };
  const jwks: JSONWebKeySet = await readLtiKeySet(owner, kidOf(assertion)).catch((err) => {
    if (!(err instanceof AppError)) throw err;
    log.info('LTI key set unreadable at the token endpoint', { clientId: id, reason: err.meta?.reason });
    return { keys: [] };
  });
  return {
    client_id: id,
    client_name: found.client.name,
    token_endpoint_auth_method: 'private_key_jwt',
    token_endpoint_auth_signing_alg: 'RS256',
    grant_types: ['client_credentials'],
    response_types: [],
    redirect_uris: [],
    jwks,
    client_kind: 'lti',
    lti_installation: { id: found.account.id, tenant_id: found.account.tenantId, granted_scopes: found.installation.grantedScopes },
  };
}

/** Read at every lookup, so a disabled account or a changed redirect URI counts at once in every process. */
async function findClient(id: string): Promise<AppClientMetadata | undefined> {
  // An LTI tool's registration holds no secret: read here, it would pass as a public client with a code flow. It is a
  // client only at the token endpoint, below.
  const [app] = await baseDb
    .select()
    .from(oauthClientsTable)
    .where(and(eq(oauthClientsTable.id, id), isNull(oauthClientsTable.ltiToolConfig)))
    .limit(1);
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
  const assertion = tokenRequestAssertion();
  const lti = assertion ? await findLtiTokenClient(id, assertion) : undefined;
  if (lti) return lti;

  // A service account is its own client_credentials client; its secret keys are the client secrets (compared by hash).
  // An installation takes no key. Its id is a UUID: any other id (a metadata document URL) would make the uuid column
  // refuse the query.
  if (!isUuid(id)) return undefined;
  const [account] = await baseDb
    .select()
    .from(serviceAccountsTable)
    .where(and(eq(serviceAccountsTable.id, id), eq(serviceAccountsTable.status, 'active'), isNull(serviceAccountsTable.oauthClientId)))
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
 * model reads the app's own tables (`oauth_clients`, active `service_accounts`, LTI installations).
 */
export class DrizzleAdapter implements Adapter {
  private readonly hashed: boolean;

  constructor(private readonly name: string) {
    this.hashed = hashedModels.has(name);
  }

  private rowId(id: string): string {
    return this.hashed ? hashToken(id) : id;
  }

  /** This model's rows that match the conditions: a row of another model with the same id never answers. */
  private modelRows(...conditions: SQL[]): SQL | undefined {
    return and(eq(oidcPayloadsTable.type, this.name), ...conditions);
  }

  async upsert(id: string, payload: AdapterPayload, expiresIn?: number): Promise<void> {
    const expiresAt = expiresIn ? isoDateIn(new TimeSpan(expiresIn, 's')) : null;
    const { jti: _value, ...withoutValue } = payload;
    const row = {
      type: this.name,
      id: this.rowId(id),
      payload: this.hashed ? withoutValue : payload,
      grantId: payload.grantId ?? null,
      accountId: payload.accountId ?? null,
      uid: payload.uid ?? null,
      expiresAt,
    };
    // A client assertion is seen once. Two concurrent requests can both pass the provider's lookup before its save: only
    // the one whose insert lands authenticates.
    if (this.name === 'ReplayDetection') {
      const [stored] = await baseDb.insert(oidcPayloadsTable).values(row).onConflictDoNothing().returning({ id: oidcPayloadsTable.id });
      if (!stored) throw new errors.InvalidClientAuth('client assertion tokens must only be used once');
      return;
    }
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
      .where(this.modelRows(eq(oidcPayloadsTable.id, this.rowId(id))))
      .limit(1);
    if (!row) return undefined;
    return this.hashed ? { ...toPayload(row), jti: id } : toPayload(row);
  }

  async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    const [row] = await baseDb
      .select()
      .from(oidcPayloadsTable)
      .where(this.modelRows(eq(oidcPayloadsTable.uid, uid)))
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
      .where(this.modelRows(eq(oidcPayloadsTable.id, rowId), isNull(oidcPayloadsTable.consumedAt)))
      .returning({ id: oidcPayloadsTable.id });
    if (spent) return;

    const [replayed] = await baseDb
      .select({ grantId: oidcPayloadsTable.grantId })
      .from(oidcPayloadsTable)
      .where(this.modelRows(eq(oidcPayloadsTable.id, rowId)))
      .limit(1);
    if (replayed?.grantId) await revokeGrant({ var: { db: baseDb } }, { grantId: replayed.grantId });
    throw new errors.InvalidGrant(`${this.name} already consumed`);
  }

  /** A grant the provider deletes itself (a revoked refresh token, a replayed code) takes its tokens' verdicts along. */
  async destroy(id: string): Promise<void> {
    if (this.name === 'Grant') return revokeGrant({ var: { db: baseDb } }, { grantId: id, withTokens: false });
    await baseDb.delete(oidcPayloadsTable).where(this.modelRows(eq(oidcPayloadsTable.id, this.rowId(id))));
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    await baseDb.delete(oidcPayloadsTable).where(this.modelRows(eq(oidcPayloadsTable.grantId, grantId)));
  }
}

function toPayload(row: typeof oidcPayloadsTable.$inferSelect): AdapterPayload {
  return { ...row.payload, ...(row.consumedAt && { consumed: Math.floor(new Date(row.consumedAt).getTime() / 1000) }) };
}
