import * as scaleway from '@pulumiverse/scaleway'
import { naming, region } from '../pulumi-context'

// ---------------------------------------------------------------------------
// Container Registry Namespace
// ---------------------------------------------------------------------------

const registry = new scaleway.registry.Namespace('main-registry', {
  name: naming.registryNamespace,
  region,
  description: `Container images for ${naming.slug}`,
  isPublic: false,
}, { aliases: [{ type: 'scaleway:index/registryNamespace:RegistryNamespace' }] })

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/** Registry namespace ID */
export const registryId = registry.id

/** Registry endpoint for docker push/pull, e.g. rg.nl-ams.scw.cloud/cella */
export const registryEndpoint = registry.endpoint

/** Registry namespace name (no hyphens) */
export const registryNamespace = registry.name
