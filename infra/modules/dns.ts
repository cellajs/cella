/**
 * DNS records — Scaleway Domains.
 *
 * Owns only the app subdomain CNAME (e.g. www → Edge Services pipeline). The API,
 * Yjs, AI and apex records live in the load balancer module because they depend
 * on the LB public IP. Skipped when no real domain is configured.
 */
import * as pulumi from '@pulumi/pulumi'
import * as scaleway from '@pulumiverse/scaleway'
import { domains, hasDomain } from '../helpers'
import { pipelineId } from './edge'

let _isApex = false
let _appSubdomain = ''

if (hasDomain && pipelineId) {
  _appSubdomain = domains.app.replace(`.${domains.zone}`, '')
  _isApex = _appSubdomain === domains.zone || _appSubdomain === ''

  if (!_isApex) {
    // CNAME record for subdomain (e.g. www.cella.dev) → Edge Services
    new scaleway.domain.Record('app-dns', {
      dnsZone: domains.zone,
      name: _appSubdomain,
      type: 'CNAME',
      data: pulumi.interpolate`${pipelineId}.svc.edge.scw.cloud.`,
      ttl: 300,
    }, { aliases: [{ type: 'scaleway:index/domainRecord:DomainRecord' }] })

    // Apex A record + 301 redirect is handled in loadbalancer.ts via LB ACLs
  }

  // CAA records — restrict which CAs may issue certs for this zone.
  new scaleway.domain.Record('caa-issue', {
    dnsZone: domains.zone,
    name: '',
    type: 'CAA',
    data: '0 issue "letsencrypt.org"',
    ttl: 300,
  })
  new scaleway.domain.Record('caa-iodef', {
    dnsZone: domains.zone,
    name: '',
    type: 'CAA',
    data: `0 iodef "mailto:security@${domains.zone}"`,
    ttl: 300,
  })
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/** Whether the app domain is at the zone apex */
export const isApexDomain = pulumi.output(_isApex)

/** The app subdomain component */
export const appSubdomainName = pulumi.output(_appSubdomain)
