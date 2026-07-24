import * as storage from './storage'
import './dns'
import * as network from './network'
import * as registry from './registry'
import * as database from './database'
import * as compute from './compute'
import './secrets'
import './vm-iam'
import * as lb from './loadbalancer'
import { mode, naming, region } from '../pulumi-context'

// The whole deployment program: one stack per mode, foundation resources plus
// the content-addressed generation VMs.

console.info(`Pulumi stack: ${mode}`)
console.info(`Slug: ${naming.slug}`)
console.info(`Region: ${region}`)
console.info(`Prefix: ${naming.prefix}`)

export const frontendBucketName = storage.frontendBucketName
export const frontendBucketEndpoint = storage.frontendBucketEndpoint
export const frontendWebsiteEndpoint = storage.frontendWebsiteEndpoint

export const vpcId = network.vpcId
export const privateNetworkId = network.privateNetworkId
export const registryId = registry.registryId
export const registryEndpoint = registry.registryEndpoint
export const registryNamespace = registry.registryNamespace
export const publicUploadsBucketName = storage.publicUploadsBucketName
export const publicUploadsBucketEndpoint = storage.publicUploadsBucketEndpoint
export const privateUploadsBucketName = storage.privateUploadsBucketName
export const privateUploadsBucketEndpoint = storage.privateUploadsBucketEndpoint
export const bootDiagBucketName = storage.bootDiagBucketName
export const bootDiagBucketEndpoint = storage.bootDiagBucketEndpoint

export const dbInstanceId = database.instanceId
export const dbName = database.databaseName
export const dbHost = database.host
export const dbConnectionStringAdmin = database.connectionStringAdmin
export const dbConnectionStringRuntime = database.connectionStringRuntime
export const dbConnectionStringCdc = database.connectionStringCdc
export const dbConnectionStringAdminPublic = database.connectionStringAdminPublic

export const computeInstances = compute.computeInstances.map((i) => i.name)
export const computeGenerationMetadata = compute.computeGenerationMetadata

export const serviceDomainUrls = lb.serviceDomainUrls
export const lbId = lb.lbId
export const lbBackendIds = lb.lbBackendIds
