import { spawnSync } from 'node:child_process'
import { isMain } from '../lib/utils/is-main'
import { scwSend, scwFetch, type ScwAuth } from '../lib/scaleway/scw-fetch'
import { infraDir } from '../lib/utils/paths'
import { getFlag } from './args'

/**
 * Level-triggered repair for terminally-errored LB certificates, run in CI
 * right before `pulumi up` (and available as `pnpm --filter infra repair-certs`).
 *
 * Scaleway never retries a Let's Encrypt certificate whose issuance failed
 * (status `error`, e.g. an ACME NXDOMAIN when validation raced DNS propagation
 * — see resources/dns-cert-gates.ts for the prevention side). The provider
 * still records the errored cert as created, wedging every subsequent deploy.
 * This task deletes such certs from Pulumi state and from Scaleway so the
 * following `up` recreates them behind the DNS-propagation gate. A cert whose
 * live object is gone (deleted out-of-band) is pruned from state only.
 *
 * Ordering per cert: state first, live second. State delete refuses while a
 * dependent (e.g. an attached frontend) references the cert, which doubles as
 * the safety interlock against deleting TLS material something still serves.
 */

const CERT_TYPE = 'scaleway:loadbalancers/certificate:Certificate'

export interface StateCert {
  urn: string
  /** Scaleway resource id: `<zone>/<uuid>`. */
  id: string
}

export type LiveCertStatus = { status: string; statusDetails?: string } | 'missing'

export interface CertRepair {
  urn: string
  zone: string
  certId: string
  deleteLive: boolean
  reason: string
}

/** Pure planning core: which certs to repair, given state entries and live status. */
export function planCertRepairs(stateCerts: StateCert[], liveById: Map<string, LiveCertStatus>): CertRepair[] {
  const repairs: CertRepair[] = []
  for (const cert of stateCerts) {
    const [zone, certId] = cert.id.split('/')
    if (!zone || !certId) continue
    const live = liveById.get(cert.id)
    if (live === 'missing') {
      repairs.push({ urn: cert.urn, zone, certId, deleteLive: false, reason: 'live certificate gone; pruning stale state entry' })
      continue
    }
    if (live && live.status === 'error') {
      repairs.push({
        urn: cert.urn,
        zone,
        certId,
        deleteLive: true,
        reason: `status=error${live.statusDetails ? ` (${live.statusDetails})` : ''}`,
      })
    }
  }
  return repairs
}

/** Certificates currently in the stack's Pulumi state. */
function certsInState(stack: string): StateCert[] {
  const result = spawnSync('pulumi', ['stack', 'export', '--stack', stack], { cwd: infraDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`pulumi stack export failed: ${result.stderr}`)
  const deployment = JSON.parse(result.stdout) as { deployment?: { resources?: Array<{ urn: string; type: string; id?: string }> } }
  return (deployment.deployment?.resources ?? [])
    .filter((resource) => resource.type === CERT_TYPE && resource.id)
    .map((resource) => ({ urn: resource.urn, id: resource.id! }))
}

async function liveStatus(auth: ScwAuth, id: string): Promise<LiveCertStatus> {
  const [zone, certId] = id.split('/')
  try {
    const cert = await scwFetch<{ status: string; status_details?: string }>(auth, 'GET', `https://api.scaleway.com/lb/v1/zones/${zone}/certificates/${certId}`)
    return { status: cert.status, statusDetails: cert.status_details }
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) return 'missing'
    throw error
  }
}

export async function main(): Promise<void> {
  const stack = getFlag(process.argv, '--stack')
  if (!stack) throw new Error('Usage: repair-certs --stack <stack>')
  const secretKey = process.env.SCW_SECRET_KEY
  if (!secretKey) throw new Error('SCW_SECRET_KEY must be set')
  const auth: ScwAuth = { secretKey }

  const stateCerts = certsInState(stack)
  const liveById = new Map<string, LiveCertStatus>()
  for (const cert of stateCerts) liveById.set(cert.id, await liveStatus(auth, cert.id))

  const repairs = planCertRepairs(stateCerts, liveById)
  if (repairs.length === 0) {
    console.info(`repair-certs: ${stateCerts.length} certificate(s) in state, none errored — nothing to repair.`)
    return
  }

  for (const repair of repairs) {
    console.info(`repair-certs: ${repair.certId} — ${repair.reason}`)
    const stateDelete = spawnSync('pulumi', ['state', 'delete', repair.urn, '--stack', stack, '--yes'], { cwd: infraDir, encoding: 'utf8' })
    if (stateDelete.status !== 0) {
      // A dependent (attached frontend) still references it: leave the live
      // object alone too — never delete TLS material something may serve.
      console.warn(`repair-certs: state delete refused for ${repair.urn} (${stateDelete.stderr.trim().slice(0, 300)}) — skipping live delete; resolve the dependent first.`)
      continue
    }
    if (repair.deleteLive) {
      await scwSend(auth, 'DELETE', `https://api.scaleway.com/lb/v1/zones/${repair.zone}/certificates/${repair.certId}`)
      console.info(`repair-certs: deleted errored certificate ${repair.certId}; the next pulumi up recreates it behind the DNS gate.`)
    }
  }
}

if (isMain(import.meta.url)) await main()
