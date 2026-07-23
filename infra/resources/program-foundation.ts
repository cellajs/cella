import * as storage from './storage'
import './dns'
import * as network from './network'
import * as registry from './registry'
import * as database from './database'
import * as compute from './compute'
import './secrets'
import './vm-iam'
import * as lb from './loadbalancer'
import { foundationInputsBundle } from './foundation-inputs'

// The full program: every foundation resource plus, in 'all' scope, the
// generation VMs ('foundation' scope leaves those to their own stacks).

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

/** Shared values the per-service generation stacks reference (micro topology). */
export const foundationInputs = foundationInputsBundle()
