import * as pulumi from '@pulumi/pulumi';

// The stack name IS the config mode: derive APP_MODE before the dynamic import
// below evaluates the shared appConfig (pulumi-context.ts still validates an
// explicitly set APP_MODE against the stack).
process.env.APP_MODE ??= pulumi.getStack().split('/').pop() ?? '';

const { loadEngineConfig } = await import('./config/engine-config');
await loadEngineConfig();
const program = await import('./resources/program');

export const frontendBucketName = program.frontendBucketName;
export const frontendBucketEndpoint = program.frontendBucketEndpoint;
export const vpcId = program.vpcId;
export const privateNetworkId = program.privateNetworkId;
export const registryId = program.registryId;
export const registryEndpoint = program.registryEndpoint;
export const registryNamespace = program.registryNamespace;
export const publicUploadsBucketName = program.publicUploadsBucketName;
export const publicUploadsBucketEndpoint = program.publicUploadsBucketEndpoint;
export const privateUploadsBucketName = program.privateUploadsBucketName;
export const privateUploadsBucketEndpoint = program.privateUploadsBucketEndpoint;
export const bootDiagBucketName = program.bootDiagBucketName;
export const bootDiagBucketEndpoint = program.bootDiagBucketEndpoint;
// Generic per-store outputs (S11): `storeOutputs.<storeId>.<key>`. The flat
// db* outputs were retired in the 2026-08 planned break.
export const storeOutputs = program.storeOutputs;
export const computeInstances = program.computeInstances;
export const computeGenerationMetadata = program.computeGenerationMetadata;
export const serviceDomainUrls = program.serviceDomainUrls;
export const lbId = program.lbId;
export const lbBackendIds = program.lbBackendIds;
