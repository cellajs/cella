import { hostname } from 'node:os';
import { createApiKey, type IamAuth, resolveApplicationIdByName } from '../../lib/scaleway/iam-client';
import type { KeyPair } from '../../lib/scaleway/operator-identity';
import { readPolicy } from '../../lib/scaleway/policy-reach';
import { appPrincipalNames } from '../../lib/scaleway/principals';
import { environments } from '../../lib/stack/project-per-mode';
import { changeMark, checkMark } from '../../lib/utils/cli-output';
import { OBSERVER_KEY_NAMES, observerKeyInModeFile, writeObserverKey } from '../../lib/utils/env-files';
import { extendObserverReach, observerReach, setupObserverApp } from '../../tasks/setup-observer-app';
import { operatorPolicyReach } from '../../tasks/setup-operator-app';
import type { InfraContext } from '../shared';
import type { OwnerKey } from './owner-key';

/** What the app's observer needs at an Owner moment for one environment on this machine. */
export type ObserverStep = 'create' | 'reach' | 'key' | 'none';

/** The observer key this machine holds: the environment's own file first, else any other environment's, as the one key serves them all. */
export function observerKeyHere(mode: string): KeyPair | undefined {
  return observerKeyInModeFile(mode) ?? environments.map(observerKeyInModeFile).find(Boolean);
}

/** The observer's step for `projectId`, read with any key that reads IAM: none needs no Owner key. */
export async function observerStep(
  auth: IamAuth,
  organizationId: string,
  context: Pick<InfraContext, 'appConfig' | 'environment'>,
  projectId: string,
): Promise<ObserverStep> {
  const reach = await observerReach(auth, organizationId, context.appConfig.appSlug);
  if (!reach) return 'create';
  if (!reach.projectIds.includes(projectId)) return 'reach';
  return observerKeyHere(context.environment) ? 'none' : 'key';
}

/** Put the observer key on this machine: the environment's file and every other environment's file that holds one, and this process. */
function storeObserverKey(mode: string, pair: KeyPair): void {
  const paths = writeObserverKey(mode, pair, environments);
  process.env[OBSERVER_KEY_NAMES.accessKey] = pair.accessKey;
  process.env[OBSERVER_KEY_NAMES.secretKey] = pair.secretKey;
  console.info(`  ${checkMark} Observer key written to ${paths.join(', ')} (SCW_OBSERVER_ACCESS_KEY / SCW_OBSERVER_SECRET_KEY)`);
}

/**
 * Make sure the app's observer reaches this environment and this machine holds its key, at an Owner moment. An app without an observer gets
 * one, with the operator's reach and address list; an observer that exists gets this environment's project added in place; a machine without
 * its key gets a key of its own, and the keys on other machines keep working. `rotate` replaces every key of the observer with one new key.
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
    const operator = await readPolicy(auth, organizationId, `${slug}-operator-policy`);
    const operatorReach = operator ? operatorPolicyReach(operator.rules) : undefined;
    const cidrs = reach?.cidrs.length ? reach.cidrs : (operatorReach?.cidrs ?? []);
    if (cidrs.length === 0) throw new Error(`the observer takes the operator's address list, and '${slug}-operator-policy' names none`);
    const projectIds = [...new Set([...(reach?.projectIds ?? operatorReach?.projectIds ?? []), projectId])];
    const key = await setupObserverApp({ callerSecretKey: ownerKey.secretKey, organizationId, projectId, projectIds, slug, cidrs });
    console.info(`  ${changeMark} '${names.observer}' ${reach ? 'has a new key; its earlier keys are revoked' : 'created'}.`);
    storeObserverKey(mode, key);
    return;
  }

  if (!reach.projectIds.includes(projectId)) {
    await extendObserverReach({ auth, organizationId, slug, projectIds: [projectId] });
    console.info(`  ${changeMark} '${names.observer}' now reaches ${mode} too.`);
  } else {
    console.info(`  ${checkMark} '${names.observer}' already reaches ${mode}.`);
  }

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
