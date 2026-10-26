/**
 * Resources the program no longer declares, and an update must not delete, as their live counterparts stay in use:
 * - the machine policies (`vm-<service>-policy`, `vm-boot-policy`), written at Owner moments since 2·1;
 * - the versions and the random values of generated runtime secrets (`secret-version-<name>`, `generated-<name>`), made by the operator task
 *   ensure-secrets since 4a·1. Deleting a version deletes the value it holds;
 * - the database roles, their privileges and passwords, and the connection strings' versions, made by the operator task ensure-database
 *   since 4a·2. Deleting a role would cut the app off its database.
 * - the shared container (`secret-<name>`, in the shared folder) of an engine-made secret with several consumers, on a stack set up before
 *   3a·1: it holds the only value until copy-shared-secrets moves it into the copies and deletes it.
 */
const MACHINE_POLICY_URN = /::scaleway:iam\/policy:Policy::vm-[a-z0-9-]+-policy$/;
const SECRET_VERSION_URN = /::scaleway:secrets\/version:Version::secret-version-([a-z0-9-]+?)(@[a-z0-9-]+)?$/;
const RANDOM_VALUE_URN = /::random:index\/randomPassword:RandomPassword::generated-([a-z0-9-]+)$/;
const DATABASE_ROLE_URN = /::scaleway:databases\/(user:User|privilege:Privilege)::[a-z0-9-]+$/;
const ROLE_PASSWORD_URN = /::random:index\/randomPassword:RandomPassword::(admin|runtime)-password$/;
const SHARED_CONTAINER_URN = /::scaleway:secrets\/secret:Secret::secret-([a-z0-9-]+)$/;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function deploymentOf(exported: unknown): Record<string, unknown> {
  if (!isRecord(exported) || !isRecord(exported.deployment)) throw new Error('retired-state: not a pulumi stack export');
  return exported.deployment;
}

function resourcesOf(deployment: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(deployment.resources) ? deployment.resources.filter(isRecord) : [];
}

/**
 * Whether a URN is a retired resource. `generated` names the runtime secrets whose values the operator tasks make, `shared` those of them
 * with several consumers.
 */
export function isRetired(urn: string, generated: ReadonlySet<string>, shared: ReadonlySet<string> = new Set()): boolean {
  if (MACHINE_POLICY_URN.test(urn) || DATABASE_ROLE_URN.test(urn) || ROLE_PASSWORD_URN.test(urn)) return true;
  const container = SHARED_CONTAINER_URN.exec(urn)?.[1];
  if (container !== undefined) return shared.has(container);
  const version = SECRET_VERSION_URN.exec(urn)?.[1];
  if (version !== undefined) return generated.has(version);
  const random = RANDOM_VALUE_URN.exec(urn)?.[1];
  return random !== undefined && generated.has(random);
}

/** The retired resources a stack export still holds, by URN. */
export function retiredUrns(exported: unknown, generated: ReadonlySet<string>, shared: ReadonlySet<string> = new Set()): string[] {
  return resourcesOf(deploymentOf(exported))
    .map((resource) => resource.urn)
    .filter((urn): urn is string => typeof urn === 'string' && isRetired(urn, generated, shared));
}

/**
 * A stack export without the given resources, and without any mention of them in the other resources. Everything else is kept as exported.
 * Removing a resource from the state, and not from Scaleway, lets the program stop declaring it: a resource the program drops is otherwise
 * deleted by the next update.
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
