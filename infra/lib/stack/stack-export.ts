import { isRecord } from '../utils/guards';

function deploymentOf(exported: unknown): Record<string, unknown> {
  if (!isRecord(exported) || !isRecord(exported.deployment)) throw new Error('stack-export: not a pulumi stack export');
  return exported.deployment;
}

function resourcesOf(deployment: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(deployment.resources) ? deployment.resources.filter(isRecord) : [];
}

/** Every URN a stack export holds. */
export function urnsOf(exported: unknown): string[] {
  return resourcesOf(deploymentOf(exported))
    .map((resource) => resource.urn)
    .filter((urn): urn is string => typeof urn === 'string');
}

/** A stack export with `edit` applied to each of its resources; everything else is kept as exported. */
export function withResources(exported: unknown, edit: (resource: Record<string, unknown>) => Record<string, unknown>): unknown {
  const deployment = deploymentOf(exported);
  return { ...(exported as Record<string, unknown>), deployment: { ...deployment, resources: resourcesOf(deployment).map(edit) } };
}

/**
 * A stack export without the given resources, and without any mention of them in the other resources. Everything else is kept as exported.
 * A resource taken out of the state, and not out of Scaleway, stays live when the stack is destroyed.
 */
export function withoutUrns(exported: unknown, urns: readonly string[]): unknown {
  const deployment = deploymentOf(exported);
  const gone = new Set(urns);
  const keep = (list: unknown) => (Array.isArray(list) ? list.filter((urn) => !gone.has(urn as string)) : list);
  const resources = resourcesOf(deployment)
    .filter((resource) => !gone.has(resource.urn as string))
    .map((resource) => {
      const next: Record<string, unknown> = { ...resource };
      if ('dependencies' in next) next.dependencies = keep(next.dependencies);
      if (isRecord(next.propertyDependencies)) {
        next.propertyDependencies = Object.fromEntries(Object.entries(next.propertyDependencies).map(([key, list]) => [key, keep(list)]));
      }
      if (typeof next.deletedWith === 'string' && gone.has(next.deletedWith)) delete next.deletedWith;
      return next;
    });
  return { ...(exported as Record<string, unknown>), deployment: { ...deployment, resources } };
}
