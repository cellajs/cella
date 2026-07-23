import { mode, naming, region, stackScope } from './pulumi-context'

console.info(`Pulumi stack: ${mode} (scope: ${stackScope})`)
console.info(`Slug: ${naming.slug}`)
console.info(`Region: ${region}`)
console.info(`Prefix: ${naming.prefix}`)

// Scope dispatch: a `<mode>-gen-<slug>` stack loads only the generation slice;
// every other stack loads the full program ('all' also provisions generations,
// 'foundation' leaves them to their own stacks). Dynamic imports keep the
// out-of-scope resource modules from evaluating at all.
const program = stackScope === 'generations' ? await import('./resources/program-generations') : await import('./resources/program-foundation')

export const frontendBucketName = program.frontendBucketName
export const frontendBucketEndpoint = program.frontendBucketEndpoint
export const frontendWebsiteEndpoint = program.frontendWebsiteEndpoint
export const vpcId = program.vpcId
export const privateNetworkId = program.privateNetworkId
export const registryId = program.registryId
export const registryEndpoint = program.registryEndpoint
export const registryNamespace = program.registryNamespace
export const publicUploadsBucketName = program.publicUploadsBucketName
export const publicUploadsBucketEndpoint = program.publicUploadsBucketEndpoint
export const privateUploadsBucketName = program.privateUploadsBucketName
export const privateUploadsBucketEndpoint = program.privateUploadsBucketEndpoint
export const bootDiagBucketName = program.bootDiagBucketName
export const bootDiagBucketEndpoint = program.bootDiagBucketEndpoint
export const dbInstanceId = program.dbInstanceId
export const dbName = program.dbName
export const dbHost = program.dbHost
export const dbConnectionStringAdmin = program.dbConnectionStringAdmin
export const dbConnectionStringRuntime = program.dbConnectionStringRuntime
export const dbConnectionStringCdc = program.dbConnectionStringCdc
export const dbConnectionStringAdminPublic = program.dbConnectionStringAdminPublic
export const computeInstances = program.computeInstances
export const computeGenerationMetadata = program.computeGenerationMetadata
export const serviceDomainUrls = program.serviceDomainUrls
export const lbId = program.lbId
export const lbBackendIds = program.lbBackendIds
export const foundationInputs = program.foundationInputs
