import * as storage from './storage';
import './dns';
import * as network from './network';
import * as registry from './registry';
import * as stores from './stores';
import './secrets';
import './state-bucket-policy';
import './identities';
import './main-job';
import { mode, naming, region } from '../pulumi-context';
import * as lb from './loadbalancer';
import './security-groups';

// The whole foundation program: one stack per mode, long-lived resources only. A deploy makes and deletes the machines (tasks/switch-machines.ts).

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

// Generic store outputs addressed `storeOutputs.<storeId>.<key>`; the database actions and ensure-database read the database store's keys from here.
export const storeOutputs = stores.allStoreOutputs;

export const serviceDomainUrls = lb.serviceDomainUrls;
export const lbId = lb.lbId;
export const lbBackendIds = lb.lbBackendIds;
