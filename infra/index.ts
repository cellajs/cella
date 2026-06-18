/**
 * Pulumi entrypoint — orchestrates all infrastructure resources.
 *
 * Resources are imported and composed here in dependency order:
 * storage → edge/dns → network/registry → database → secrets/compute → loadbalancer.
 * Comment out a group to deploy incrementally (see README.md → Architecture).
 */
import { naming, region, mode } from './pulumi-context'

console.info(`Pulumi stack: ${mode}`)
console.info(`Slug: ${naming.slug}`)
console.info(`Region: ${region}`)
console.info(`Prefix: ${naming.prefix}`)

// ---------------------------------------------------------------------------
// Static site (Object Storage)
// ---------------------------------------------------------------------------

import * as storage from './resources/storage'

export const frontendBucketName = storage.frontendBucketName
export const frontendBucketEndpoint = storage.frontendBucketEndpoint
export const frontendWebsiteEndpoint = storage.frontendWebsiteEndpoint

// ---------------------------------------------------------------------------
// Edge Services (CDN + WAF) + DNS
// ---------------------------------------------------------------------------

import * as edge from './resources/edge'
import * as dns from './resources/dns'

export const pipelineId = edge.pipelineId
export const isApexDomain = dns.isApexDomain
export const appSubdomainName = dns.appSubdomainName

// ---------------------------------------------------------------------------
// Network + Registry + Upload Buckets
// ---------------------------------------------------------------------------

import * as network from './resources/network'
import * as registry from './resources/registry'

export const vpcId = network.vpcId
export const privateNetworkId = network.privateNetworkId
export const registryId = registry.registryId
export const registryEndpoint = registry.registryEndpoint
export const registryNamespace = registry.registryNamespace
export const publicUploadsBucketName = storage.publicUploadsBucketName
export const publicUploadsBucketEndpoint = storage.publicUploadsBucketEndpoint
export const privateUploadsBucketName = storage.privateUploadsBucketName
export const privateUploadsBucketEndpoint = storage.privateUploadsBucketEndpoint

// ---------------------------------------------------------------------------
// Database (Managed PostgreSQL)
// ---------------------------------------------------------------------------

import * as database from './resources/database'

export const dbInstanceId = database.instanceId
export const dbName = database.databaseName
export const dbHost = database.host
export const dbConnectionStringAdmin = database.connectionStringAdmin
export const dbConnectionStringRuntime = database.connectionStringRuntime
export const dbConnectionStringCdc = database.connectionStringCdc
export const dbConnectionStringAdminPublic = database.connectionStringAdminPublic

// ---------------------------------------------------------------------------
// Secrets + Compute (Docker Compose VMs)
// ---------------------------------------------------------------------------

import * as compute from './resources/compute'
import './resources/secrets'
import './resources/vm-iam'

export const computeInstances = compute.computeInstances.map((i) => i.name)

// ---------------------------------------------------------------------------
// Load Balancer + API/Yjs/AI DNS
// ---------------------------------------------------------------------------

import * as lb from './resources/loadbalancer'

// Public URL per LB-exposed service slug (e.g. { backend: 'https://api.…', … }).
// Empty object when no domain / compute. Consumers (CI summary, docs) read
// slugs from this map instead of per-service named outputs, so a new service
// needs no export added here.
export const serviceDomainUrls = lb.serviceDomainUrls
