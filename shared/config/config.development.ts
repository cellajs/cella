import type { DeepPartial } from '../src/config-builder/types.ts';
import { config } from './config.default.ts';

const origin = 'http://localhost:3000';

export const development = {
  name: `${config.name} DEVELOPMENT`,
  slug: `${config.slug}-development`,

  has: { selfRegistration: true, waitlist: true, chatSupport: false, ltiPlatform: true },
  // The app is both LTI roles here: `pnpm seed` connects one seeded tenant as an LTI tool to another's platform, and a
  // launch frames the app's own embedded pages.
  enabledAuthStrategies: [...config.enabledAuthStrategies, 'lti'],
  ltiFrameAncestors: [origin],

  domain: '',
  // Same-origin in development too: the Vite dev server is the origin and proxies the service paths to the service
  // ports (vite.config.ts), so cookies and CSP behave like production. `devAppIndex` moves this port with the services.
  origin,
  // The authorization server runs locally so the MCP consent flow can be exercised end to end.
  services: { oauth: { enabled: true }, mcp: { enabled: true } },

  // The template's shared development buckets hold the seed files and the GeoIP databases, so seeded attachments
  // render before the app has storage of its own.
  s3: { region: 'nl-ams', host: 's3.nl-ams.scw.cloud', publicBucketName: 'cella-shared-public', privateBucketName: 'cella-shared-private' },
} satisfies DeepPartial<typeof config>;
