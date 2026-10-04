import { appConfig } from 'shared';
import type { FederationConfig } from 'shared/config-builder/types';
import { testDatabaseName, withDatabase } from 'shared/test-db';
import { vi } from 'vitest';

// Each worker runs on its own database (global-setup.ts prepares one per worker), so test files run in parallel without
// seeing each other's rows. The config's URLs name the shared database; swapped before any app module reads the env.
for (const key of ['DATABASE_URL', 'DATABASE_ADMIN_URL'] as const) {
  const url = process.env[key];
  if (url) process.env[key] = withDatabase(url, testDatabaseName);
}

// The SSO suites sign in through `surfconext`. An app that declares no such federation gets this one for the test run,
// added before any app module loads: schemas list the federation keys when they are imported.
const federations: Record<string, FederationConfig> = appConfig.federations;
federations.surfconext ??= {
  label: 'SURFconext',
  issuer: 'https://connect.test.surfconext.nl',
  idpMetadataUrl: 'https://metadata.test.surfconext.nl/idps-metadata.xml',
  scopes: ['openid'],
  clientAuthMethod: 'client_secret_basic',
  tenantClaim: 'schac_home_organization',
  snapshotClaims: ['eduperson_affiliation', 'eduperson_scoped_affiliation'],
  addressAuthority: true,
};

// Every limiter passes every request; a test of a real limiter calls `vi.unmock('#/middlewares/rate-limiter/core')`.
vi.mock('#/middlewares/rate-limiter/core', async () => (await import('./test-utils')).rateLimiterCoreMock());
vi.mock('#/middlewares/rate-limiter/helpers', async (importOriginal) => (await import('./test-utils')).rateLimiterHelpersMock(importOriginal));

// Every mail renders for real and is recorded for `sentMails`; test mode sends none. The config clears the record
// before each test (`clearMocks`).
vi.mock('#/lib/mailer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/lib/mailer')>();
  return { ...actual, mailer: { ...actual.mailer, prepareEmails: vi.fn(actual.mailer.prepareEmails) } };
});

// The app's outbound requests get an empty 200 (a Request's own JSON body as the answer), so no test reaches the
// network. A test that needs real fetch calls `vi.unstubAllGlobals()`; `startTestOauthServer` does.
vi.stubGlobal(
  'fetch',
  vi.fn(async (input: unknown) => {
    if (input instanceof Request) {
      const json = () =>
        input
          .clone()
          .json()
          .catch(() => ({}));
      return { ok: true, status: 200, json, text: async () => '', clone: () => input.clone() };
    }
    const answer = { json: async () => ({}), text: async () => '' };
    return { ok: true, status: 200, ...answer, clone: () => answer };
  }),
);
