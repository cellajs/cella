import * as scaleway from '@pulumiverse/scaleway';
import { engineConfig as appConfig } from '../config/engine-config';
import { dnsZone } from '../pulumi-context';

// CAA records restrict which CAs may issue certs for this zone, and admit the LB's Let's Encrypt certificates. Zone-wide policy, so only the stack serving `www.<zone>` owns them.
const managesZonePolicy = new URL(appConfig.frontendUrl).hostname === `www.${dnsZone}`;

if (managesZonePolicy) {
  new scaleway.domain.Record('caa-issue', { dnsZone, name: '', type: 'CAA', data: '0 issue "letsencrypt.org"', ttl: 300 });

  new scaleway.domain.Record('caa-iodef', { dnsZone, name: '', type: 'CAA', data: `0 iodef "mailto:security@${dnsZone}"`, ttl: 300 });
}
