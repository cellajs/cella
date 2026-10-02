import type { PgTable } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { type SecretColumnTable, secretColumns } from '#/db/secret-columns';
import { mockPastIsoDate } from '#/mocks';
import { passkeyChallengesTable } from '#/modules/auth/passkeys/passkey-challenges-db';
import { sessionsTable } from '#/modules/auth/sessions/sessions-db';
import { tokensTable } from '#/modules/auth/tokens-db';
import { encryptTotpSecret } from '#/modules/auth/totps/helpers/totp-secret-encryption';
import { totpsTable } from '#/modules/auth/totps/totps-db';
import { oauthClientsTable } from '#/modules/oauth-server/oauth-clients-db';
import { signingKeysTable } from '#/modules/oauth-server/signing-keys-db';
import { apiKeysTable } from '#/modules/service-accounts/api-keys-db';
import { adminRole, memberRole } from '../fixtures';
import { createTestOrganization, createTestSession, createTestUser, insertTestSession, rawJsonRequest, testTotpSecret } from '../helpers';
import { createInvitation } from '../invitations/helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey', 'totp'] });

/** The table of each `secretColumns` entry: a table added to the registry is a type error until it is listed here. */
const secretTables = {
  api_keys: apiKeysTable,
  oauth_clients: oauthClientsTable,
  passkey_challenges: passkeyChallengesTable,
  sessions: sessionsTable,
  signing_keys: signingKeysTable,
  tokens: tokensTable,
  totps: totpsTable,
} satisfies Record<SecretColumnTable, PgTable>;

/** Every value stored in a secret column at this moment, by table. */
async function storedSecrets() {
  const stored = {} as Record<SecretColumnTable, string[]>;
  for (const [name, table] of Object.entries(secretTables) as [SecretColumnTable, PgTable][]) {
    const rows: Record<string, unknown>[] = await db.select().from(table);
    const columns: readonly string[] = secretColumns[name];
    stored[name] = rows.flatMap((row) =>
      columns.map((column) => row[column]).filter((value): value is string => typeof value === 'string' && value !== ''),
    );
  }
  return stored;
}

/** The path of every key, at any depth of `body`, that `names` holds. */
function keysNamed(body: unknown, names: readonly string[], path = 'body'): string[] {
  if (Array.isArray(body)) return body.flatMap((item, index) => keysNamed(item, names, `${path}[${index}]`));
  if (body === null || typeof body !== 'object') return [];
  return Object.entries(body).flatMap(([key, value]) => [
    ...(names.includes(key) ? [`${path}.${key}`] : []),
    ...keysNamed(value, names, `${path}.${key}`),
  ]);
}

interface Case {
  route: string;
  /** The secret-bearing tables the response is built from. */
  tables: SecretColumnTable[];
  send: () => Promise<{ status: number; body: unknown }>;
  status: number;
  /** Values the body must contain, so a response that left the rows out cannot pass. */
  shows: () => string[];
}

/**
 * Response schemas omit every `secretColumns` entry (db/utils/drizzle-schema.ts), but nothing holds a response to its
 * schema at runtime, and a spread row type-checks with its secret still on it. These read the raw bodies the routes send
 * and look in them for every value stored in a secret column, and for the secret column names of the tables they read.
 */
describe('Secret columns in responses', async () => {
  const call = await createAppClient();
  let organization: { id: string; tenantId: string };
  let admin: { id: string; sessionCookie: string };
  let invitee: { sessionCookie: string; otherSessionId: string; inactiveMembershipId: string; tokenId: string; invitationCookie: string };
  let serviceAccountId: string;
  let apiKeyId: string;
  let rolledKeyId: string;

  const serviceAccounts = () => `/${organization.tenantId}/${organization.id}/service-accounts`;

  /** A raw request as the admin that hands its body to `keep`, which stores the ids a later case needs. */
  const sendAndKeep = async (path: string, init: { method: string; body?: unknown }, keep: (body: Record<string, unknown>) => void) => {
    const result = await rawJsonRequest(path, admin.sessionCookie, init);
    if (result.status < 300) keep(result.body as Record<string, unknown>);
    return result;
  };

  beforeAll(async () => {
    organization = await createTestOrganization();
    admin = await createOrgUser(call, organization.tenantId, organization.id, 'secrets-admin', adminRole);

    // The invitee holds the TOTP: on the admin it would make key creation ask for a step-up.
    const inviteeUser = await createTestUser('secrets-invitee@security-test.com');
    await db.insert(totpsTable).values({ userId: inviteeUser.id, secret: encryptTotpSecret(testTotpSecret), createdAt: mockPastIsoDate() });
    const invitation = await createInvitation({
      organization,
      email: inviteeUser.email,
      createdBy: admin.id,
      boundTo: inviteeUser.id,
      token: 'invoked',
    });
    invitee = {
      sessionCookie: await createTestSession(inviteeUser),
      otherSessionId: (await insertTestSession(inviteeUser)).id,
      inactiveMembershipId: invitation.inactiveMembership.id,
      tokenId: invitation.token.id,
      invitationCookie: invitation.invitationCookie,
    };
  });

  afterAll(async () => await clearSecurityTestData());

  // In order: later cases revoke or roll what earlier ones listed and created.
  const cases: Case[] = [
    {
      route: 'GET /me/auth',
      tables: ['sessions', 'totps'],
      send: () => rawJsonRequest('/me/auth', invitee.sessionCookie),
      status: 200,
      shows: () => [invitee.otherSessionId],
    },
    {
      route: 'DELETE /me/sessions',
      tables: ['sessions'],
      send: () => rawJsonRequest('/me/sessions', invitee.sessionCookie, { method: 'DELETE', body: { ids: [invitee.otherSessionId] } }),
      status: 200,
      shows: () => [invitee.otherSessionId],
    },
    {
      route: 'POST service-accounts',
      tables: ['api_keys'],
      send: () =>
        sendAndKeep(
          serviceAccounts(),
          { method: 'POST', body: { name: 'CI bot', role: memberRole, key: { name: 'deploy', scopes: null } } },
          (body) => {
            serviceAccountId = (body.serviceAccount as { id: string }).id;
            apiKeyId = (body.apiKey as { id: string }).id;
          },
        ),
      status: 201,
      shows: () => [serviceAccountId, apiKeyId],
    },
    {
      route: 'GET service-accounts/{id}/keys',
      tables: ['api_keys'],
      send: () => rawJsonRequest(`${serviceAccounts()}/${serviceAccountId}/keys`, admin.sessionCookie),
      status: 200,
      shows: () => [apiKeyId],
    },
    {
      route: 'POST service-accounts/{id}/keys',
      tables: ['api_keys'],
      send: () =>
        sendAndKeep(`${serviceAccounts()}/${serviceAccountId}/keys`, { method: 'POST', body: { name: 'rolled', rollFrom: apiKeyId } }, (body) => {
          rolledKeyId = body.id as string;
        }),
      status: 201,
      shows: () => [rolledKeyId],
    },
    {
      route: 'DELETE service-accounts/{id}/keys/{keyId}',
      tables: ['api_keys'],
      send: () => rawJsonRequest(`${serviceAccounts()}/${serviceAccountId}/keys/${apiKeyId}`, admin.sessionCookie, { method: 'DELETE' }),
      status: 200,
      shows: () => [apiKeyId],
    },
    {
      route: 'GET /me/invitations',
      tables: ['tokens'],
      send: () => rawJsonRequest('/me/invitations', invitee.sessionCookie),
      status: 200,
      shows: () => [invitee.inactiveMembershipId],
    },
    {
      route: 'GET /auth/token/invitation/{id}',
      tables: ['tokens'],
      send: () => rawJsonRequest(`/auth/token/invitation/${invitee.tokenId}`, invitee.invitationCookie),
      status: 200,
      shows: () => [invitee.inactiveMembershipId],
    },
    {
      route: 'POST /auth/passkey/generate-challenge',
      tables: ['passkey_challenges'],
      send: () => rawJsonRequest('/auth/passkey/generate-challenge', '', { method: 'POST', body: { type: 'authentication' } }),
      status: 200,
      shows: () => [],
    },
  ];

  it.each(cases)('must not send a stored secret via $route', async ({ send, status, tables, shows }) => {
    const { status: actual, body } = await send();
    expect(actual, JSON.stringify(body)).toBe(status);

    // Positive controls: the rows are in the body, and the tables behind them hold secrets to leak.
    const text = JSON.stringify(body);
    for (const value of shows()) expect(text).toContain(value);
    const stored = await storedSecrets();
    for (const table of tables) expect(stored[table].length, `${table} holds no secret`).toBeGreaterThan(0);

    expect(
      Object.values(stored)
        .flat()
        .filter((secret) => text.includes(secret)),
    ).toEqual([]);
    expect(
      keysNamed(
        body,
        tables.flatMap((table) => secretColumns[table]),
      ),
    ).toEqual([]);
  });
});
