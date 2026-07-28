import type * as pulumi from '@pulumi/pulumi'
import * as storage from './storage'
import './dns'
import * as network from './network'
import * as registry from './registry'
import * as stores from './stores'
import * as compute from './compute'
import './secrets'
import './state-bucket-policy'
import './vm-iam'
import * as lb from './loadbalancer'
import { mode, naming, region } from '../pulumi-context'

/** Read a named output from the primary store, failing loudly if it is absent. */
function primaryStoreOutput(name: string): pulumi.Output<string> {
  const value = stores.primaryStoreOutputs[name]
  if (value === undefined) throw new Error(`program: primary store did not expose output '${name}'`)
  return value
}

// The whole deployment program: one stack per mode, long-lived base resources
// plus the content-addressed generation VMs.

console.info(`Pulumi stack: ${mode}`)
console.info(`Slug: ${naming.slug}`)
console.info(`Region: ${region}`)
console.info(`Prefix: ${naming.prefix}`)

export const frontendBucketName = storage.frontendBucketName
export const frontendBucketEndpoint = storage.frontendBucketEndpoint

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

export const dbInstanceId = primaryStoreOutput('instanceId')
export const dbName = primaryStoreOutput('databaseName')
export const dbHost = primaryStoreOutput('host')
export const dbConnectionStringAdmin = primaryStoreOutput('connectionStringAdmin')
export const dbConnectionStringRuntime = primaryStoreOutput('connectionStringRuntime')
export const dbConnectionStringCdc = primaryStoreOutput('connectionStringCdc')
export const dbConnectionStringAdminPublic = primaryStoreOutput('connectionStringAdminPublic')
export const dbCaCertificate = primaryStoreOutput('caCertificate')

export const computeInstances = compute.computeInstances.map((i) => i.name)
export const computeGenerationMetadata = compute.computeGenerationMetadata

export const serviceDomainUrls = lb.serviceDomainUrls
export const lbId = lb.lbId
export const lbBackendIds = lb.lbBackendIds
