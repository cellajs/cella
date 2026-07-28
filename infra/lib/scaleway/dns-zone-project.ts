import { scwFetch, type ScwAuth } from './scw-fetch'

const DOMAIN_BASE = 'https://api.scaleway.com/domain/v2beta1'

interface DnsZoneItem {
  domain: string
  subdomain: string
  project_id: string
}

/** Full zone name for a Scaleway DNS zone list item. */
function zoneName(zone: DnsZoneItem): string {
  return zone.subdomain ? `${zone.subdomain}.${zone.domain}` : zone.domain
}

/**
 * Project id of the most specific existing DNS zone that serves `dnsZone`
 * (exact match or parent zone), or undefined when no zone matches. Records for
 * a stack can land in a parent zone owned by another project (staging on the
 * production apex), so the CI grant must cover that zone's project, not just
 * the app project.
 */
export async function resolveDnsZoneProjectId(auth: ScwAuth, dnsZone: string): Promise<string | undefined> {
  if (!dnsZone) return undefined
  const { dns_zones: zones = [] } = await scwFetch<{ dns_zones?: DnsZoneItem[] }>(auth, 'GET', `${DOMAIN_BASE}/dns-zones?page_size=100`)
  const matches = zones.filter((zone) => {
    const name = zoneName(zone)
    return dnsZone === name || dnsZone.endsWith(`.${name}`)
  })
  if (matches.length === 0) return undefined
  matches.sort((a, b) => zoneName(b).length - zoneName(a).length)
  return matches[0]?.project_id
}

/**
 * Project ids the CI key's DNS grant must cover: the app project (where a
 * fresh zone is created) plus the serving zone's project when it differs.
 * Falls back to the app project alone when the zone lookup fails (the caller
 * may lack DNS read; the grant then covers the common same-project case).
 */
export async function resolveDnsProjectIds(auth: ScwAuth, dnsZone: string, appProjectId: string): Promise<string[]> {
  const zoneProjectId = await resolveDnsZoneProjectId(auth, dnsZone).catch((err: unknown) => {
    console.warn(`DNS zone project lookup failed (${err instanceof Error ? err.message : String(err)}); scoping DNS to the app project only.`)
    return undefined
  })
  return zoneProjectId && zoneProjectId !== appProjectId ? [appProjectId, zoneProjectId] : [appProjectId]
}
