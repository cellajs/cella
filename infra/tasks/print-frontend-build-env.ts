import { isMain } from '../lib/utils/is-main'
import { parseServiceRows } from '../lib/utils/service-rows'
import { getFlag } from './args'
import { errorMessage } from '../lib/utils/errors'

interface ServiceUrlRow {
  service: string
  public_url: string
}

export function parseServiceUrls(raw: string): ServiceUrlRow[] {
  return parseServiceRows(raw, '--services-json', { required: ['service', 'public_url'] })
}

/**
 * Env for the CI frontend build. APP_MODE selects the baked appConfig
 * (shared/src/config-builder/app-config.ts prefers it over NODE_ENV, which the
 * build script pins to production); BACKEND_URL/FRONTEND_URL are the override
 * names that same loader reads, keeping the deploy pipeline authoritative for
 * public URLs.
 */
export function frontendBuildEnv(mode: string, raw: string): Record<'APP_MODE' | 'BACKEND_URL' | 'FRONTEND_URL', string> {
  const rows = parseServiceUrls(raw)
  const backendUrl = rows.find((row) => row.service === 'backend')?.public_url
  const frontendUrl = rows.find((row) => row.service === 'frontend')?.public_url
  if (!backendUrl || !frontendUrl) throw new Error('frontend/backend public URLs are required to build the frontend')
  return { APP_MODE: mode, BACKEND_URL: backendUrl, FRONTEND_URL: frontendUrl }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const mode = getFlag(argv, '--mode')
  const servicesJson = getFlag(argv, '--services-json')
  if (!mode || !servicesJson) throw new Error('Usage: print-frontend-build-env.ts --mode <environment> --services-json <enabled_services_json>')
  for (const [key, value] of Object.entries(frontendBuildEnv(mode, servicesJson))) {
    console.info(`${key}=${value}`)
  }
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(`::error::${errorMessage(err)}`)
    process.exit(1)
  })
}
