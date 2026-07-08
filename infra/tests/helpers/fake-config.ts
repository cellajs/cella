import type { appConfig } from 'shared'

export function fakeConfig(overrides: Partial<Record<string, unknown>> = {}) {
  // Returned as the real appConfig type so consuming tests keep property-level
  // checking (the fixture itself stays a minimal literal).
  return {
    slug: 'cella',
    mode: 'production' as const,
    domain: 'cellajs.com',
    frontendUrl: 'https://www.cellajs.com',
    backendUrl: 'https://api.cellajs.com',
    yjsUrl: 'https://yjs.cellajs.com',
    mcpUrl: 'https://mcp.cellajs.com',
    services: {
      frontend: { enabled: true, publicUrl: 'https://www.cellajs.com' },
      backend: { enabled: true, publicUrl: 'https://api.cellajs.com' },
      cdc: { enabled: true },
      yjs: { enabled: false, publicUrl: 'https://yjs.cellajs.com' },
      mcp: { enabled: false, publicUrl: 'https://mcp.cellajs.com' },
    },
    securityEmail: 'security@cellajs.com',
    s3: {
      host: 's3.nl-ams.scw.cloud',
      region: 'nl-ams',
      publicBucket: 'cella-public',
      privateBucket: 'cella-private',
    },
    ...overrides,
  } as unknown as typeof appConfig
}
