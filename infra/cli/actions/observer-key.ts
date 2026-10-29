import { hostname } from 'node:os';
import { createApiKey, resolveApplicationIdByName } from '../../lib/scaleway/iam-client';
import type { KeyPair } from '../../lib/scaleway/operator-identity';
import { readPolicy } from '../../lib/scaleway/policy-reach';
import { appPrincipalNames } from '../../lib/scaleway/principals';
import { environments } from '../../lib/stack/project-per-mode';
import { changeMark, checkMark } from '../../lib/utils/cli-output';
import { OBSERVER_KEY_NAMES, observerKeyInModeFile, writeObserverKey } from '../../lib/utils/env-files';
import { writeMachinePolicies } from '../../tasks/machine-policies';
import { observerPolicy, observerReach, setupObserverApp } from '../../tasks/setup-observer-app';
import { operatorPolicyReach } from '../../tasks/setup-operator-app';
import type { InfraContext } from '../shared';
import type { OwnerKey } from './owner-key';

/** What the app's observer needs at an Owner moment for one environment on this machine, beside the rules of its policy. */
export type ObserverStep = 'create' | 'key' | 'none';

/** The observer key this machine holds: the environment's own file first, else any other environment's, as the one key serves them all. */
export function observerKeyHere(mode: string): KeyPair | undefined {
  return observerKeyInModeFile(mode) ?? environments.map(observerKeyInModeFile).find(Boolean);
}

/** The observer's step on this machine: `create` when the app has none, `key` when this machine holds none of its keys. */
export function observerStep(exists: boolean, mode: string): ObserverStep {
  if (!exists) return 'create';
  return observerKeyHere(mode) ? 'none' : 'key';
}

/** Put the observer key on this machine: the environment's file and every other environment's file that holds one, and this process. */
function storeObserverKey(mode: string, pair: KeyPair): void {
  const paths = writeObserverKey(mode, pair, environments);
  process.env[OBSERVER_KEY_NAMES.accessKey] = pair.accessKey;
  process.env[OBSERVER_KEY_NAMES.secretKey] = pair.secretKey;
  console.info(`  ${checkMark} Observer key written to ${paths.join(', ')} (SCW_OBSERVER_ACCESS_KEY / SCW_OBSERVER_SECRET_KEY)`);
}

/**
 * Make sure the app's observer reaches this environment as declared and this machine holds its key, at an Owner moment. An app without an
 * observer gets one, with the operator's reach; an observer that exists gets its rules written in place, with this environment's project,
 * so its keys keep working; a machine without its key gets a key of its own, and the keys on other machines keep working. `rotate` replaces
 * every key of the observer with one new key.
 */
export async function ensureObserverForEnvironment(
  context: InfraContext,
  ownerKey: OwnerKey,
  projectId: string,
  opts: { rotate?: boolean } = {},
): Promise<void> {
  const mode = context.environment;
  const slug = context.appConfig.appSlug;
  const names = appPrincipalNames(slug);
  const auth = { secretKey: ownerKey.secretKey };
  const { organizationId } = ownerKey;
  const reach = await observerReach(auth, organizationId, slug);

  if (!reach || opts.rotate) {
    const operator = reach ? undefined : await readPolicy(auth, organizationId, `${names.operator}-policy`);
    const reached = reach?.projectIds ?? (operator ? operatorPolicyReach(operator.rules).projectIds : []);
    const projectIds = [...new Set([...reached, projectId])];
    const key = await setupObserverApp({ callerSecretKey: ownerKey.secretKey, organizationId, projectId, projectIds, slug });
    console.info(`  ${changeMark} '${names.observer}' ${reach ? 'has a new key; its earlier keys are revoked' : 'created'}.`);
    storeObserverKey(mode, key);
    return;
  }

  const policy = observerPolicy({ slug, organizationId, projectIds: [...reach.projectIds, projectId] });
  const [written] = await writeMachinePolicies(auth, organizationId, [policy], () => undefined);
  if (written?.change === 'update') console.info(`  ${changeMark} The rules of ${policy.name} are replaced; its keys are unchanged.`);
  else console.info(`  ${checkMark} '${names.observer}' reaches ${mode} as declared.`);

  const here = observerKeyHere(mode);
  if (here) {
    storeObserverKey(mode, here);
    return;
  }
  const applicationId = await resolveApplicationIdByName(auth, organizationId, names.observer);
  if (!applicationId) throw new Error(`'${names.observer}' has a policy but no application`);
  const created = await createApiKey(auth, {
    applicationId,
    description: `observer: ${hostname()} ${new Date().toISOString().slice(0, 10)}`,
    defaultProjectId: projectId,
  });
  console.info(`  ${changeMark} A key of '${names.observer}' for this machine.`);
  storeObserverKey(mode, { accessKey: created.access_key, secretKey: created.secret_key });
}
