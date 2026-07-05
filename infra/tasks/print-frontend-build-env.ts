import { isMain } from '../lib/is-main'
import { parseServiceRows } from '../lib/service-rows'
import { getFlag } from './args'
import { errorMessage } from '../lib/errors'

interface ServiceUrlRow {
  service: string
  public_url: string
}

export function parseServiceUrls(raw: string): ServiceUrlRow[] {
  return parseServiceRows(raw, '--services-json', { required: ['service', 'public_url'] })
}

export function frontendBuildEnv(raw: string): Record<'VITE_BACKEND_URL' | 'VITE_FRONTEND_URL', string> {
  const rows = parseServiceUrls(raw)
  const backendUrl = rows.find((row) => row.service === 'backend')?.public_url
  const frontendUrl = rows.find((row) => row.service === 'frontend')?.public_url
  if (!backendUrl || !frontendUrl) throw new Error('frontend/backend public URLs are required to build the frontend')
  return { VITE_BACKEND_URL: backendUrl, VITE_FRONTEND_URL: frontendUrl }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const servicesJson = getFlag(argv, '--services-json')
  if (!servicesJson) throw new Error('Usage: print-frontend-build-env.ts --services-json <enabled_services_json>')
  for (const [key, value] of Object.entries(frontendBuildEnv(servicesJson))) {
    console.info(`${key}=${value}`)
  }
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(`::error::${errorMessage(err)}`)
    process.exit(1)
  })
}