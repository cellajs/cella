import * as scaleway from '@pulumiverse/scaleway'
import { naming, region, tags } from '../pulumi-context'

// ---------------------------------------------------------------------------
// VPC
// ---------------------------------------------------------------------------

const vpc = new scaleway.network.Vpc('main-vpc', {
  name: naming.resource('vpc'),
  region,
  tags,
}, { aliases: [{ type: 'scaleway:index/vpc:Vpc' }] })

// ---------------------------------------------------------------------------
// Private Network
// ---------------------------------------------------------------------------

const privateNetwork = new scaleway.network.PrivateNetwork('main-private-network', {
  name: naming.resource('private-network'),
  vpcId: vpc.id,
  region,
  tags,
  ipv4Subnet: {
    subnet: '10.0.0.0/24',
  },
}, { aliases: [{ type: 'scaleway:index/vpcPrivateNetwork:VpcPrivateNetwork' }] })

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/** VPC ID */
export const vpcId = vpc.id

/** Private Network ID used by database and containers. */
export const privateNetworkId = privateNetwork.id
