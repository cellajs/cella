import { pathToFileURL } from 'node:url'
import { getFlag } from './args'

interface ServiceUrlRow {
  service: string
  public_url: string
}

export function parseServiceUrls(raw: string): ServiceUrlRow[] {
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error('--services-json must be a JSON array')
  return parsed.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`--services-json[${index}] must be an object`)
    const service = (item as Record<string, unknown>).service
    const publicUrl = (item as Record<string, unknown>).public_url
    if (typeof service !== 'string') throw new Error(`--services-json[${index}].service must be a string`)
    if (typeof publicUrl !== 'string') throw new Error(`--services-json[${index}].public_url must be a string`)
    return { service, public_url: publicUrl }
  })
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

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err instanceof Error ? `::error::${err.message}` : err)
    process.exit(1)
  })
}