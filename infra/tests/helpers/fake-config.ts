/**
 * Minimal AppConfig-shaped fixture for infra tests.
 *
 * The full appConfig type has many fields, but the infra layer only reads the
 * ones below. Casting keeps this fast and decoupled from the rest of shared/.
 *
 * This is the single source of truth for the "canonical" infra test config, so
 * tests stay fork-agnostic (slug `cella`, not whatever a fork renamed to). Pair
 * with `deriveInfra` to assert on derived names instead of hardcoding literals.
 */
export function fakeConfig(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    slug: 'cella',
    mode: 'production' as const,
    domain: 'cellajs.com',
    frontendUrl: 'https://www.cellajs.com',
    backendUrl: 'https://api.cellajs.com',
    yjsUrl: 'https://yjs.cellajs.com',
    aiUrl: 'https://ai.cellajs.com',
    services: {
      frontend: { enabled: true, publicUrl: 'https://www.cellajs.com' },
      backend: { enabled: true, publicUrl: 'https://api.cellajs.com' },
      cdc: { enabled: true },
      yjs: { enabled: false, publicUrl: 'https://yjs.cellajs.com' },
      ai: { enabled: false, publicUrl: 'https://ai.cellajs.com' },
    },
    securityEmail: 'security@cellajs.com',
    s3: {
      host: 's3.nl-ams.scw.cloud',
      region: 'nl-ams',
      publicBucket: 'cella-public',
      privateBucket: 'cella-private',
    },
    ...overrides,
    // biome-ignore lint/suspicious/noExplicitAny: typed via cast for test fixture
  } as any
}
