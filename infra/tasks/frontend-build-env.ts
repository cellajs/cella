import { parseServiceRows } from '../lib/utils/service-rows';

interface ServiceUrlRow {
  service: string;
  public_url: string;
}

export function parseServiceUrls(raw: string): ServiceUrlRow[] {
  return parseServiceRows(raw, '--services-json', { required: ['service', 'public_url'] });
}

/**
 * Env for the builder's frontend build. APP_MODE selects the baked appConfig (shared/src/config-builder/app-config.ts
 * prefers it over NODE_ENV, which the build script pins to production). APP_ORIGIN is the origin override that same
 * loader reads: the public URLs come from the deploy pipeline. RELEASE_SHA is the release the images report, which the
 * bundle reports too: the build's container has no git.
 */
export function frontendBuildEnv(mode: string, raw: string, releaseSha: string): Record<'APP_MODE' | 'APP_ORIGIN' | 'RELEASE_SHA', string> {
  const rows = parseServiceUrls(raw);
  const frontendUrl = rows.find((row) => row.service === 'frontend')?.public_url;
  if (!frontendUrl) throw new Error('the frontend public URL is required to build the frontend');
  return { APP_MODE: mode, APP_ORIGIN: frontendUrl, RELEASE_SHA: releaseSha };
}
