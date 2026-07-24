import * as scaleway from '@pulumiverse/scaleway'
import { engineConfig } from '../config/engine-config'
import { dnsZone } from '../pulumi-context'

const appConfig = engineConfig()

// CAA records: restrict which CAs may issue certs for this zone. Compatible with
// the LB's Let's Encrypt managed certificates. Zone-wide policy, so exactly ONE
// stack per zone owns them: the one serving `www.<zone>` (same rule as the apex
// resources in loadbalancer.ts). A staging stack on the shared zone skips them.
const managesZonePolicy = new URL(appConfig.frontendUrl).hostname === `www.${dnsZone}`

if (managesZonePolicy) {
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
