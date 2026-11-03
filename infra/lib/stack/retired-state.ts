import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { engineMadeRuntimeSecrets } from '../runtime-secrets';
import { infraDir } from '../utils/paths';

/**
 * Resources the program no longer declares, and an update must not delete, as their live counterparts stay in use:
 * - the machines the program made before the deploy made them (`vm-`, `ip-`, `pnic-` and `ipam-<service>-<id>`): they serve until the
 *   first deploy's machines do, and the alignment that moved machines out of the program deletes them through the API;
 * - the machine policies (`vm-<service>-policy`, `vm-boot-policy`), written at Owner moments since 2·1;
 * - the versions and the random values of generated runtime secrets (`secret-version-<name>`, `generated-<name>`), made by the operator task
 *   ensure-secrets since 4a·1. Deleting a version deletes the value it holds;
 * - the database roles, their privileges and passwords, and the connection strings' versions, made by the operator task ensure-database
 *   since 4a·2. Deleting a role would cut the app off its database.
 * A runtime secret's one container (`secret-<name>`, in the runtime folder) is the program's, and never retired.
 */
const MACHINE_POLICY_URN = /::scaleway:iam\/policy:Policy::vm-[a-z0-9-]+-policy$/;
const PROGRAM_MACHINE_URN =
  /::scaleway:(instance\/server:Server::vm-|instance\/ip:Ip::ip-|instance\/privateNic:PrivateNic::pnic-|ipam\/ip:Ip::ipam-)[a-z0-9]+(-[a-z0-9]+)*-[0-9a-f]{6,}$/;
const SECRET_VERSION_URN = /::scaleway:secrets\/version:Version::secret-version-([a-z0-9-]+?)(@[a-z0-9-]+)?$/;
const RANDOM_VALUE_URN = /::random:index\/randomPassword:RandomPassword::generated-([a-z0-9-]+)$/;
const DATABASE_ROLE_URN = /::scaleway:databases\/(user:User|privilege:Privilege)::[a-z0-9-]+$/;
const ROLE_PASSWORD_URN = /::random:index\/randomPassword:RandomPassword::(admin|runtime)-password$/;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function deploymentOf(exported: unknown): Record<string, unknown> {
  if (!isRecord(exported) || !isRecord(exported.deployment)) throw new Error('retired-state: not a pulumi stack export');
  return exported.deployment;
}

function resourcesOf(deployment: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(deployment.resources) ? deployment.resources.filter(isRecord) : [];
}

/** Whether a URN is a retired resource. `generated` names the runtime secrets whose values the operator tasks make. */
export function isRetired(urn: string, generated: ReadonlySet<string>): boolean {
  if (MACHINE_POLICY_URN.test(urn) || PROGRAM_MACHINE_URN.test(urn) || DATABASE_ROLE_URN.test(urn) || ROLE_PASSWORD_URN.test(urn)) return true;
  const version = SECRET_VERSION_URN.exec(urn)?.[1];
  if (version !== undefined) return generated.has(version);
  const random = RANDOM_VALUE_URN.exec(urn)?.[1];
  return random !== undefined && generated.has(random);
}

/** Every URN a stack export holds. */
export function urnsOf(exported: unknown): string[] {
  return resourcesOf(deploymentOf(exported))
    .map((resource) => resource.urn)
    .filter((urn): urn is string => typeof urn === 'string');
}

/** The retired resources a stack export still holds, by URN. */
export function retiredUrns(exported: unknown, generated: ReadonlySet<string>): string[] {
  return urnsOf(exported).filter((urn) => isRetired(urn, generated));
}

/** A stack export with `edit` applied to each of its resources; everything else is kept as exported. */
export function withResources(exported: unknown, edit: (resource: Record<string, unknown>) => Record<string, unknown>): unknown {
  const deployment = deploymentOf(exported);
  return { ...(exported as Record<string, unknown>), deployment: { ...deployment, resources: resourcesOf(deployment).map(edit) } };
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

/**
 * Take the retired resources out of a stack's Pulumi state, and leave them live: the program no longer declares them, so an update would
 * otherwise delete them. Idempotent: a stack without them is left alone. The caller holds the lease and logged in to the state backend in
 * `env`; the export before the change is kept beside the edited one in a temporary folder.
 * @returns how many resources left the state
 * @throws when an export or the import fails, or the state still holds one after it
 */
export function forgetRetiredResources(stack: string, env: NodeJS.ProcessEnv, log: (message: string) => void = console.info): number {
  const generated = new Set(engineMadeRuntimeSecrets().map((definition) => definition.secretName));
  const run = (args: string[]) =>
    spawnSync('pulumi', [...args, '--stack', stack], { cwd: infraDir, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const exported = run(['stack', 'export']);
  if (exported.status !== 0) throw new Error(`pulumi stack export failed: ${exported.stderr.trim()}`);
  const document: unknown = JSON.parse(exported.stdout);
  const urns = retiredUrns(document, generated);
  if (urns.length === 0) {
    log('The state holds no retired resource.');
    return 0;
  }
  const folder = mkdtempSync(join(tmpdir(), 'forget-retired-resources-'));
  writeFileSync(join(folder, 'before.json'), exported.stdout, { mode: 0o600 });
  const editedFile = join(folder, 'after.json');
  writeFileSync(editedFile, JSON.stringify(withoutUrns(document, urns)), { mode: 0o600 });
  const imported = run(['stack', 'import', '--file', editedFile]);
  if (imported.status !== 0)
    throw new Error(`pulumi stack import failed: ${imported.stderr.trim()} (the export before the change is ${folder}/before.json)`);
  const check = run(['stack', 'export']);
  if (check.status !== 0 || retiredUrns(JSON.parse(check.stdout), generated).length > 0) {
    throw new Error(`the state still holds retired resources after the import (the export before the change is ${folder}/before.json)`);
  }
  log(`Took ${urns.length} retired resource(s) out of the state; they stay live: ${urns.map((u) => u.split('::').pop()).join(', ')}.`);
  return urns.length;
}
