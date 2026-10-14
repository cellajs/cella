/** A machine policy as a stack records it: `vm-<service>-policy` and `vm-boot-policy`, declared by the program until they were written at Owner moments. */
const MACHINE_POLICY_URN = /::scaleway:iam\/policy:Policy::vm-[a-z0-9-]+-policy$/;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function deploymentOf(exported: unknown): Record<string, unknown> {
  if (!isRecord(exported) || !isRecord(exported.deployment)) throw new Error('machine-policy-state: not a pulumi stack export');
  return exported.deployment;
}

function resourcesOf(deployment: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(deployment.resources) ? deployment.resources.filter(isRecord) : [];
}

/** The machine policies a stack export still holds, by URN. */
export function machinePolicyUrns(exported: unknown): string[] {
  return resourcesOf(deploymentOf(exported))
    .map((resource) => resource.urn)
    .filter((urn): urn is string => typeof urn === 'string' && MACHINE_POLICY_URN.test(urn));
}

/**
 * A stack export without its machine policies, and without any mention of them in the other resources: the machines once depended on them.
 * Everything else is kept as exported. Removing the policies from the state, and not from IAM, lets the program stop declaring them: a resource
 * the program drops is otherwise deleted by the next update.
 */
export function withoutMachinePolicies(exported: unknown): unknown {
  const deployment = deploymentOf(exported);
  const gone = new Set(machinePolicyUrns(exported));
  const keep = (urns: unknown) => (Array.isArray(urns) ? urns.filter((urn) => !gone.has(urn as string)) : urns);
  const resources = resourcesOf(deployment)
    .filter((resource) => !gone.has(resource.urn as string))
    .map((resource) => {
      const next: Record<string, unknown> = { ...resource };
      if ('dependencies' in next) next.dependencies = keep(next.dependencies);
      if (isRecord(next.propertyDependencies)) {
        next.propertyDependencies = Object.fromEntries(Object.entries(next.propertyDependencies).map(([key, urns]) => [key, keep(urns)]));
      }
      if (typeof next.deletedWith === 'string' && gone.has(next.deletedWith)) delete next.deletedWith;
      return next;
    });
  return { ...(exported as Record<string, unknown>), deployment: { ...deployment, resources } };
}
