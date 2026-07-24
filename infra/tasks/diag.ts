import { isMain } from '../lib/utils/is-main'
import { getFlag } from './args'
import { createAwsReader, parseKeys, renderDiagnostics, selectDiagnostics, summarizeBundles } from './fetch-boot-diag'

interface ResolvedTarget {
  bucket: string
  region: string
  serviceNames: readonly string[]
}

/** Derive bucket/region/service-list from appConfig for the given app mode. */
async function resolveTarget(mode: string): Promise<ResolvedTarget> {
  process.env.APP_MODE = mode
  const { loadEngineConfig } = await import('../config/engine-config')
  const appConfig = await loadEngineConfig()
  const { deriveInfra } = await import('../lib/naming')
  const { serviceNames } = await import('../compose/compose')
  const { naming, region } = deriveInfra(appConfig)
  return { bucket: naming.bootDiagBucket, region, serviceNames }
}

/** Render the `--list` overview as an aligned plain-text table. */
function printSummary(keys: string[], serviceNames: readonly string[], log: (msg: string) => void = console.info): void {
  const rows = summarizeBundles(keys, serviceNames)
  const pad = (s: string, n: number) => s.padEnd(n)
  log(`${pad('service', 12)}${pad('bundles', 9)}${pad('failures', 10)}latest full`)
  for (const r of rows) {
    log(`${pad(r.service, 12)}${pad(String(r.total), 9)}${pad(String(r.failures), 10)}${r.latestFull ?? '\u2014'}`)
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const mode = getFlag(argv, '--mode') ?? process.env.APP_MODE ?? 'production'
  const only = getFlag(argv, '--service')
  const wantList = argv.includes('--list')

  const target = await resolveTarget(mode)
  const bucket = getFlag(argv, '--bucket') ?? target.bucket
  const region = getFlag(argv, '--region') ?? target.region
  const services = only ? [only] : target.serviceNames

  const reader = createAwsReader(`https://s3.${region}.scw.cloud`, bucket)
  // A list failure (missing aws CLI, bad creds, wrong bucket) throws here with a
  // clear message when the service slug is invalid.
  const keys = parseKeys(reader.list())

  if (wantList) {
    printSummary(keys, services)
    return
  }

  const style = process.env.GITHUB_ACTIONS === 'true' ? 'ci' : 'plain'
  for (const service of services) {
    renderDiagnostics(service, selectDiagnostics(keys, service), reader, console.info, style)
  }
}

if (isMain(import.meta.url)) await main()
