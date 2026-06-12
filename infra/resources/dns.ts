/**
 * DNS records — Scaleway Domains.
 *
 * Owns only the app subdomain CNAME (e.g. www → Edge Services pipeline). The API,
 * Yjs, AI and apex records live in the load balancer module because they depend
 * on the LB public IP. Skipped while Edge Services is disabled (no pipeline).
 */
import * as pulumi from '@pulumi/pulumi'
import * as scaleway from '@pulumiverse/scaleway'
import { dnsZone, serviceHost } from '../pulumi-context'
import { pipelineId } from './edge'

let _isApex = false
let _appSubdomain = ''

if (pipelineId) {
  const appHost = serviceHost('frontend')
  _appSubdomain = appHost.replace(`.${dnsZone}`, '')
  _isApex = _appSubdomain === dnsZone || _appSubdomain === ''

  if (!_isApex) {
    // CNAME record for subdomain (e.g. www.cellajs.com) → Edge Services
    new scaleway.domain.Record('app-dns', {
      dnsZone,
      name: _appSubdomain,
      type: 'CNAME',
      data: pulumi.interpolate`${pipelineId}.svc.edge.scw.cloud.`,
      ttl: 300,
    }, { aliases: [{ type: 'scaleway:index/domainRecord:DomainRecord' }] })

    // Apex A record + 301 redirect is handled in loadbalancer.ts via LB ACLs
  }

  // CAA records — restrict which CAs may issue certs for this zone.
  new scaleway.domain.Record('caa-issue', {
    dnsZone,
    name: '',
    type: 'CAA',
    data: '0 issue "letsencrypt.org"',
    ttl: 300,
  })
  new scaleway.domain.Record('caa-iodef', {
    dnsZone,
    name: '',
    type: 'CAA',
    data: `0 iodef "mailto:security@${dnsZone}"`,
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
