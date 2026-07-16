import type { appConfig } from 'shared'

export function fakeConfig(overrides: Partial<Record<string, unknown>> = {}) {
  // Returned as the real appConfig type so consuming tests keep property-level
  // checking (the fixture itself stays a minimal literal).
  return {
    slug: 'cella',
    mode: 'production' as const,
    domain: 'cellajs.com',
    frontendUrl: 'https://www.cellajs.com',
    backendUrl: 'https://www.cellajs.com/api',
    yjsUrl: 'wss://www.cellajs.com/yjs',
    mcpUrl: 'https://www.cellajs.com/mcp',
    services: {
      frontend: { enabled: true, publicUrl: 'https://www.cellajs.com' },
      backend: { enabled: true, publicUrl: 'https://www.cellajs.com/api' },
      cdc: { enabled: true },
      yjs: { enabled: false, publicUrl: 'wss://www.cellajs.com/yjs' },
      mcp: { enabled: false, publicUrl: 'https://www.cellajs.com/mcp' },
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
