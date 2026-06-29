/**
 * DNS records — Scaleway Domains.
 *
 * CAA records restricting certificate issuance to Let's Encrypt — the CA the
 * load balancer's managed certificates use. The per-service A/CNAME records and
 * the apex→www redirect live in the load balancer module (resources/loadbalancer.ts),
 * since they depend on the LB public IP.
 */
import * as scaleway from '@pulumiverse/scaleway'
import { dnsZone } from '../pulumi-context'

// CAA records — restrict which CAs may issue certs for this zone. Compatible with
// the LB's Let's Encrypt managed certificates.
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
