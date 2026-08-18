import * as scaleway from '@pulumiverse/scaleway';
import { naming, region, tags } from '../pulumi-context';

const vpc = new scaleway.network.Vpc('main-vpc', {
  name: naming.resource('vpc'),
  region,
  tags,
});

/** IPv4 subnet of the private network, and the source allow-list for the ACL-guarded internal LB frontends. */
export const privateNetworkSubnet = '10.0.0.0/24';

const privateNetwork = new scaleway.network.PrivateNetwork('main-private-network', {
  name: naming.resource('private-network'),
  vpcId: vpc.id,
  region,
  tags,
  ipv4Subnet: {
    subnet: privateNetworkSubnet,
  },
});

export const vpcId = vpc.id;

export const privateNetworkId = privateNetwork.id;
