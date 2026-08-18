import * as storage from './storage';
import './dns';
import * as compute from './compute';
import * as network from './network';
import * as registry from './registry';
import * as stores from './stores';
import './secrets';
import './state-bucket-policy';
import './vm-iam';
import { mode, naming, region } from '../pulumi-context';
import * as lb from './loadbalancer';

// The whole deployment program: one stack per mode, long-lived base resources plus the content-addressed generation VMs.

console.info(`Pulumi stack: ${mode}`);
console.info(`Slug: ${naming.slug}`);
console.info(`Region: ${region}`);
console.info(`Prefix: ${naming.prefix}`);

export const frontendBucketName = storage.frontendBucketName;
export const frontendBucketEndpoint = storage.frontendBucketEndpoint;

export const vpcId = network.vpcId;
export const privateNetworkId = network.privateNetworkId;
export const registryId = registry.registryId;
export const registryEndpoint = registry.registryEndpoint;
export const registryNamespace = registry.registryNamespace;
export const publicUploadsBucketName = storage.publicUploadsBucketName;
export const publicUploadsBucketEndpoint = storage.publicUploadsBucketEndpoint;
export const privateUploadsBucketName = storage.privateUploadsBucketName;
export const privateUploadsBucketEndpoint = storage.privateUploadsBucketEndpoint;
export const bootDiagBucketName = storage.bootDiagBucketName;
export const bootDiagBucketEndpoint = storage.bootDiagBucketEndpoint;

// Generic store outputs addressed `storeOutputs.<storeId>.<key>`; the db-exposure and seed CLI reads the primary store's keys from here.
export const storeOutputs = stores.allStoreOutputs;

export const computeInstances = compute.computeInstances.map((i) => i.name);
export const computeGenerationMetadata = compute.computeGenerationMetadata;

export const serviceDomainUrls = lb.serviceDomainUrls;
export const lbId = lb.lbId;
export const lbBackendIds = lb.lbBackendIds;
