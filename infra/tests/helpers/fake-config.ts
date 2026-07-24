import type { EngineConfig } from '../../config/engine-config'

/** Minimal cella-shaped EngineConfig fixture for pure derivation tests. */
export function fakeConfig(overrides: Partial<EngineConfig> = {}): EngineConfig {
  return {
    slug: 'cella',
    mode: 'production',
    domain: 'cellajs.com',
    frontendUrl: 'https://www.cellajs.com',
    backendUrl: 'https://www.cellajs.com/api',
    singleVM: false,
    services: {
      frontend: { enabled: true, publicUrl: 'https://www.cellajs.com' },
      backend: { enabled: true, publicUrl: 'https://www.cellajs.com/api' },
      cdc: { enabled: true },
      yjs: { enabled: false, publicUrl: 'wss://www.cellajs.com/yjs' },
      mcp: { enabled: false, publicUrl: 'https://www.cellajs.com/mcp' },
    },
    s3: {
      host: 's3.nl-ams.scw.cloud',
      region: 'nl-ams',
      publicBucket: 'cella-public',
      privateBucket: 'cella-private',
      publicCDNUrl: 'https://cella-public.s3.nl-ams.scw.cloud',
      privateCDNUrl: 'https://cella-private.s3.nl-ams.scw.cloud',
    },
    ...overrides,
  }
}
