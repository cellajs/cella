/**
 * Pulumi entrypoint — orchestrates all infrastructure modules.
 *
 * Modules are imported and composed here in dependency order:
 * storage → edge/dns → network/registry → database → secrets/compute → loadbalancer → monitoring.
 * Comment out a group to deploy incrementally (see INFRA_ARCHITECTURE.md).
 */
import { naming, region, mode } from './helpers'

console.info(`Pulumi stack: ${mode}`)
console.info(`Slug: ${naming.slug}`)
console.info(`Region: ${region}`)
console.info(`Prefix: ${naming.prefix}`)

// ---------------------------------------------------------------------------
// Static site (Object Storage)
// ---------------------------------------------------------------------------

import * as storage from './modules/storage'

export const frontendBucketName = storage.frontendBucketName
export const frontendBucketEndpoint = storage.frontendBucketEndpoint
export const frontendWebsiteEndpoint = storage.frontendWebsiteEndpoint

// ---------------------------------------------------------------------------
// Edge Services (CDN + WAF) + DNS
// ---------------------------------------------------------------------------

import * as edge from './modules/edge'
import * as dns from './modules/dns'

export const pipelineId = edge.pipelineId
export const isApexDomain = dns.isApexDomain
export const appSubdomainName = dns.appSubdomainName

// ---------------------------------------------------------------------------
// Network + Registry + Upload Buckets
// ---------------------------------------------------------------------------

import * as network from './modules/network'
import * as registry from './modules/registry'

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

import * as database from './modules/database'

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

import * as compute from './modules/compute'
import './modules/secrets'

export const computeInstances = compute.computeInstances.map((i) => i.name)

// ---------------------------------------------------------------------------
// Load Balancer + API/Yjs/AI DNS
// ---------------------------------------------------------------------------

import * as lb from './modules/loadbalancer'
import * as pulumi from '@pulumi/pulumi'

export const apiDomainUrl = lb.apiDomainUrl ?? pulumi.output('')
export const yjsDomainUrl = lb.yjsDomainUrl ?? pulumi.output('')
export const aiDomainUrl = lb.aiDomainUrl ?? pulumi.output('')

// ---------------------------------------------------------------------------
// Monitoring (Cockpit data sources)
// ---------------------------------------------------------------------------

import * as monitoring from './modules/monitoring'

export const metricsSourceId = monitoring.metricsSourceId
export const logsSourceId = monitoring.logsSourceId
