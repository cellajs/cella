/**
 * Ensure the app's DNS zone is hosted on Scaleway DNS so the dns/loadbalancer
 * Pulumi modules can create records (CAA, A, CNAME).
 *
 * Scenario: domain is registered elsewhere (Gandi, Namecheap, Cloudflare…) and
 * we want Scaleway to host the zone. Activation requires two manual steps at
 * the *current* DNS provider — Scaleway can't write them for us because, by
 * definition, it isn't authoritative yet:
 *
 *   1. TXT `_scaleway-challenge.<domain>` with the per-domain token shown in
 *      the console (must land within 48h or the registration is dropped).
 *      Scaleway validates by public DNS lookup; once it resolves, the zone
 *      flips to `active`.
 *   2. Delegate NS for <domain> to ns0/ns1.dom.scw.cloud so Pulumi-managed
 *      records (CAA, A, CNAME) actually resolve.
 *
 * Flow here:
 *   - List dns-zones. If apex is `active`, return.
 *   - If missing, POST /external-domains (409 / 403 "already in process" are
 *     treated as "registration already exists, continue").
 *   - Defer to the email Scaleway sends with the exact records to add, then
 *     poll on a recheck prompt until the zone flips to `active`.
 */

import { confirm } from '@inquirer/prompts'
import { pc } from 'shared/cli-utils/colors';
import { checkMark, tildeMark, warningMark } from 'shared/console'
import { resolveProjectId } from './bootstrap-scw-env'
import { isMain } from '../utils/is-main'
import { errorMessage } from '../utils/errors'

const BASE = 'https://api.scaleway.com/domain/v2beta1'
const CHALLENGE_NAME = '_scaleway-challenge'

interface DnsZone {
  domain: string
  subdomain: string
  status: 'unknown' | 'active' | 'pending' | 'error'
  message?: string | null
  ns?: string[]
}

async function listZones(secretKey: string, projectId: string, domain: string): Promise<DnsZone[]> {
  // Cache-bust with a timestamp param and explicit no-cache headers — some
  // intermediaries seem to return stale zone status otherwise.
  const url = `${BASE}/dns-zones/?project_id=${projectId}&domain=${encodeURIComponent(domain)}&page_size=100&_=${Date.now()}`
  const res = await fetch(url, {
    headers: { 'X-Auth-Token': secretKey, 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`GET dns-zones failed: ${res.status} ${await res.text()}`)
  const body = (await res.json()) as { dns_zones?: DnsZone[] }
  return body.dns_zones ?? []
}

async function registerExternal(
  secretKey: string,
  projectId: string,
  domain: string,
): Promise<{ created: boolean; alreadyInProcess: boolean }> {
  const res = await fetch(`${BASE}/external-domains`, {
    method: 'POST',
    headers: { 'X-Auth-Token': secretKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain, project_id: projectId }),
  })
  if (res.ok) return { created: true, alreadyInProcess: false }
  const text = await res.text()
  // 409 = already registered to this project; 403 "already in process" = a
  // prior registration is mid-validation (most likely awaiting the TXT
  // challenge). Both mean "registration exists, proceed to challenge step".
  if (res.status === 409) return { created: false, alreadyInProcess: false }
  if (res.status === 403 && /already in process/i.test(text)) return { created: false, alreadyInProcess: true }
  throw new Error(`POST external-domains failed: ${res.status} ${text}`)
}

export async function ensureDnsZone(opts: {
  secretKey: string
  projectId: string
  domain: string
}): Promise<{ status: 'active' | 'pending' | 'skipped' }> {
  const { secretKey, projectId, domain } = opts

  const findApex = (zones: DnsZone[]) => zones.find((z) => z.domain === domain && (z.subdomain === '' || z.subdomain == null))

  let zones = await listZones(secretKey, projectId, domain)
  let apex = findApex(zones)

  if (apex?.status === 'active') {
    console.info(`  ${tildeMark} DNS zone ${pc.cyan(domain)} already active on Scaleway`)
    return { status: 'active' }
  }

  if (!apex) {
    console.info(`  ${tildeMark} Registering ${pc.cyan(domain)} as an external domain on Scaleway DNS…`)
    const reg = await registerExternal(secretKey, projectId, domain)
    if (reg.alreadyInProcess) {
      console.info(`  ${tildeMark} Existing registration is awaiting ownership verification.`)
    }
    zones = await listZones(secretKey, projectId, domain)
    apex = findApex(zones)
  }

  console.info(`\n  ${warningMark} ${pc.bold(`DNS zone ${domain} is pending ownership verification.`)}`)
  console.info(`  Scaleway has sent an email with the exact records to add at your current DNS provider`)
  console.info(`  (TXT ${pc.cyan(`${CHALLENGE_NAME}.${domain}`)} + apex NS delegation). Follow that email,`)
  console.info(`  or manage the domain at ${pc.underline('https://console.scaleway.com/domains/external')}.`)
  console.info(`  A second email will arrive once ownership is validated — then recheck below.\n`)

  while (true) {
    const action = await confirm({ message: 'Recheck DNS zone status now? (No = skip and continue)', default: true })
    if (!action) {
      console.info(`  ${warningMark} Skipped. Pulumi will fail on DNS records until validation completes — re-run bootstrap to retry.`)
      return { status: 'skipped' }
    }
    const freshZones = await listZones(secretKey, projectId, domain)
    const fresh = findApex(freshZones)
    if (fresh?.status === 'active') {
      console.info(`  ${checkMark} DNS zone ${pc.cyan(domain)} is active`)
      return { status: 'active' }
    }
    console.info(`  ${tildeMark} Still ${pc.yellow(fresh?.status ?? 'pending')}${fresh?.message ? ` — ${fresh.message}` : ''}`)
    if (process.env.SCW_DEBUG === '1' || process.env.DEBUG === '1') {
      console.info(`  ${tildeMark} Raw zones matching ${domain}:`)
      console.info(`     ${pc.dim(JSON.stringify(freshZones, null, 2))}`)
    }
  }
}

// Standalone CLI usage: SCW_SECRET_KEY + SCW_PROJECT_ID + DOMAIN required.
if (isMain(import.meta.url)) {
  const secretKey = process.env.SCW_SECRET_KEY
  const projectId = resolveProjectId()
  const domain = process.env.DOMAIN ?? process.argv[2]
  if (!secretKey || !projectId || !domain) {
    console.error('SCW_SECRET_KEY, SCW_PROJECT_ID and DOMAIN (env or argv[2]) required')
    process.exit(1)
  }
  ensureDnsZone({ secretKey, projectId, domain }).catch((err) => {
    console.error(errorMessage(err))
    process.exit(1)
  })
}
