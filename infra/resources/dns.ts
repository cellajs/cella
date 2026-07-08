import * as scaleway from '@pulumiverse/scaleway'
import { dnsZone } from '../pulumi-context'

// CAA records: restrict which CAs may issue certs for this zone. Compatible with
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
