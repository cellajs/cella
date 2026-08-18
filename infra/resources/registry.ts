import * as scaleway from '@pulumiverse/scaleway';
import { naming, region } from '../pulumi-context';

const registry = new scaleway.registry.Namespace('main-registry', {
  name: naming.registryNamespace,
  region,
  description: `Container images for ${naming.slug}`,
  isPublic: false,
});

export const registryId = registry.id;

/** Registry endpoint for docker push and pull, e.g. rg.nl-ams.scw.cloud/<namespace> */
export const registryEndpoint = registry.endpoint;

export const registryNamespace = registry.name;
