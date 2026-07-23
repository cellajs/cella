import * as compute from './compute'

// The generation slice: ONE service's VM generations (stack `<mode>-gen-<slug>`).
// Foundation values arrive through the foundation-inputs seam, so nothing but
// VMs, their IPs, and NICs is ever provisioned here.

export const computeInstances = compute.computeInstances.map((i) => i.name)
export const computeGenerationMetadata = compute.computeGenerationMetadata

// Foundation-only outputs, absent in this scope.
export const frontendBucketName = undefined
export const frontendBucketEndpoint = undefined
export const frontendWebsiteEndpoint = undefined
export const vpcId = undefined
export const privateNetworkId = undefined
export const registryId = undefined
export const registryEndpoint = undefined
export const registryNamespace = undefined
export const publicUploadsBucketName = undefined
export const publicUploadsBucketEndpoint = undefined
export const privateUploadsBucketName = undefined
export const privateUploadsBucketEndpoint = undefined
export const bootDiagBucketName = undefined
export const bootDiagBucketEndpoint = undefined
export const dbInstanceId = undefined
export const dbName = undefined
export const dbHost = undefined
export const dbConnectionStringAdmin = undefined
export const dbConnectionStringRuntime = undefined
export const dbConnectionStringCdc = undefined
export const dbConnectionStringAdminPublic = undefined
export const serviceDomainUrls = undefined
export const lbId = undefined
export const lbBackendIds = undefined
export const foundationInputs = undefined
