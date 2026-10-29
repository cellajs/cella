import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { actionCommand, actionLabel } from '../../lib/operator-actions';
import { declaredIdentities } from '../../lib/scaleway/declared-identities';
import { IAM_BASE, type IamAuth, listOrganizationPolicies, resolveApplicationIdByName } from '../../lib/scaleway/iam-client';
import type { MachineKeyStep } from '../../lib/scaleway/machine-keys';
import type { MachinePolicy } from '../../lib/scaleway/machine-policies';
import { organizationIdOfKey, resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { type AppPrincipalNames, appPrincipalNames, principalNames } from '../../lib/scaleway/principals';
import { makeS3Client, projectAccessKey } from '../../lib/scaleway/s3-client';
import { deleteApplicationCascade } from '../../lib/scaleway/scaleway-iam';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { scwSend } from '../../lib/scaleway/scw-fetch';
import { engineSecretPath } from '../../lib/scaleway/secret-paths';
import { stateBucket } from '../../lib/stack/control-store';
import { changeMark, checkMark, pc, tildeMark, warningMark } from '../../lib/utils/cli-output';
import { ADMIN_KEY_SECRET_NAME } from '../../tasks/admit-operator-buckets';
import { ensureMachineIdentities, missingMachineIdentities } from '../../tasks/machine-identities';
import { planMachineKeys, writeMachineKeys } from '../../tasks/machine-keys';
import { type MachinePolicyStep, planMachinePolicies, writeMachinePolicies } from '../../tasks/machine-policies';
import { declaredObserverPolicy } from '../../tasks/setup-observer-app';
import { confirmOrDefault, endAction, type InfraContext } from '../shared';
import { ensureObserverForEnvironment, type ObserverStep, observerKeyHere, observerStep } from './observer-key';
import { acquireIdentityKey } from './operator-unlock';
import { type OwnerKey, printRevokeReminder } from './owner-key';

/** The retired admin application of an environment that still has it; removable once no bucket policy needs it (see `retiredAdmin`). */
export interface RetiredAdmin {
  name: string;
  id: string;
  removable: boolean;
}

/** What an identity update would change for the machines and the deploy: the applications the registry lacks, each policy, each standing key. */
export interface MachineIdentityPlan {
  missingApplications: string[];
  policies: MachinePolicyStep[];
  keys: MachineKeyStep[];
}

/** A policy on one of the environment's identities beside the declared one, which the inventory reports: no step of the engine writes one. */
export interface ExtraPolicy {
  id: string;
  name: string;
  application: string;
}

/**
 * What an identity update would change: the machine part with the observer's policy among its policies, the policies beside the declared
 * ones, the observer's step on this machine, the retired admin.
 */
export interface IdentityPlan extends MachineIdentityPlan {
  extraPolicies: ExtraPolicy[];
  observer: ObserverStep;
  retiredAdmin?: RetiredAdmin;
}

/** True when the plan changes nothing. A retired admin application that must stay is no change. */
export function identityPlanIsEmpty(plan: IdentityPlan): boolean {
  return (
    plan.missingApplications.length === 0 &&
    plan.policies.every((step) => step.change === 'none') &&
    plan.keys.every((step) => step.change === 'none') &&
    plan.extraPolicies.length === 0 &&
    plan.observer === 'none' &&
    !plan.retiredAdmin?.removable
  );
}

/** The machine part of a plan as lines to print. */
function machineIdentityLines(plan: MachineIdentityPlan): string[] {
  const words: Record<MachinePolicyStep['change'], string> = {
    none: 'as declared',
    create: 'to create',
    update: 'rules to replace',
    'missing-application': 'to create once its application exists',
  };
  return [
    ...plan.missingApplications.map((name) => `application ${name}: to create`),
    ...plan.policies.filter((step) => step.change !== 'none').map((step) => `policy ${step.policy}: ${words[step.change]}`),
    ...plan.keys.flatMap((step) =>
      step.change === 'make'
        ? [`standing key of ${step.application}: to make${step.extra.length > 0 ? `, its ${step.extra.length} other key(s) deleted` : ''}`]
        : step.change === 'prune'
          ? [`standing key of ${step.application}: ${step.extra.length} key(s) beside it to delete`]
          : [],
    ),
  ];
}

/** The plan as lines to print. */
export function identityPlanLines(plan: IdentityPlan, names: Pick<AppPrincipalNames, 'observer'>): string[] {
  const observerWords: Record<ObserverStep, string | undefined> = {
    none: undefined,
    create: 'to create, its key written to this machine',
    key: 'a key for this machine',
  };
  const observer = observerWords[plan.observer];
  return [
    ...machineIdentityLines(plan),
    ...plan.extraPolicies.map((policy) => `policy ${policy.name} on ${policy.application}: beside the declared one, to delete`),
    ...(observer ? [`observer ${names.observer}: ${observer}`] : []),
    ...(plan.retiredAdmin?.removable ? [`application ${plan.retiredAdmin.name}: retired, to delete with its keys and its custody secret`] : []),
  ];
}

/**
 * The environment's retired admin application, when it still exists. It is removable once the state bucket admits the observer: a policy that
 * names the observer was written by the program after the operator was admitted, and the admission writes every bucket's policy that lacked
 * it in one run. Before that, the admin application is the only principal those policies name that can rewrite them.
 */
async function retiredAdmin(
  auth: IamAuth,
  organizationId: string,
  context: Pick<InfraContext, 'appConfig' | 'environment' | 'projectId'>,
): Promise<RetiredAdmin | undefined> {
  const { admin: name } = principalNames(context.appConfig.slug, context.environment);
  const id = await resolveApplicationIdByName(auth, organizationId, name);
  if (!id) return undefined;
  const observer = observerKeyHere(context.environment);
  if (!observer) return { name, id, removable: false };
  const s3 = await makeS3Client(context.appConfig.s3.region, projectAccessKey(observer.accessKey, context.projectId), observer.secretKey);
  const removable = await s3.send(new ListObjectsV2Command({ Bucket: stateBucket(context.appConfig.slug), MaxKeys: 1 })).then(
    () => true,
    () => false,
  );
  return { name, id, removable };
}

/** A Secret Manager client in the environment's project. */
function secretsFor(context: Pick<InfraContext, 'appConfig' | 'projectId'>, secretKey: string) {
  return createSecretManagerClient({ secretKey, region: context.appConfig.s3.region, projectId: context.projectId });
}

/** Every policy an identity update writes for an environment: the machine identities' and the deploy key's. Written at Owner moments only. */
function declaredPolicies(context: Pick<InfraContext, 'appConfig' | 'environment' | 'projectId'>, organizationId: string): MachinePolicy[] {
  const { appConfig, projectId } = context;
  return declaredIdentities({ slug: appConfig.slug, mode: context.environment }, { projectId, organizationId }).policies;
}

/**
 * The machine part of an identity update, read with any key that reads IAM and secret metadata: the observer's, the operator's (an apply stops
 * on it, as the operator key writes no IAM), the Owner's.
 */
async function planMachineIdentities(
  auth: IamAuth,
  organizationId: string,
  context: Pick<InfraContext, 'appConfig' | 'environment' | 'projectId'>,
): Promise<MachineIdentityPlan> {
  const registry = { slug: context.appConfig.slug, mode: context.environment };
  return {
    missingApplications: await missingMachineIdentities({ ...registry, secretKey: auth.secretKey, organizationId }),
    policies: await planMachinePolicies(auth, organizationId, declaredPolicies(context, organizationId)),
    keys: await planMachineKeys({ auth, secrets: secretsFor(context, auth.secretKey), organizationId, ...registry }),
  };
}

/**
 * End a run on the operator key when the machine identities differ from the declared ones: they are IAM, which that key cannot write, and an
 * `up` would fail on them halfway or leave machines a deploy cannot hand keys to. `release` lets go of what the run holds first.
 */
export async function exitOnIdentityChanges(
  context: Pick<InfraContext, 'appConfig' | 'environment' | 'projectId'>,
  key: { secretKey: string; organizationId: string },
  release?: () => Promise<void>,
): Promise<void> {
  const plan = await planMachineIdentities({ secretKey: key.secretKey }, key.organizationId, context).catch((error) => {
    console.warn(`${warningMark} Could not read the identities (${error instanceof Error ? error.message : String(error)}).`);
    return undefined;
  });
  const changes = plan ? machineIdentityLines(plan) : [];
  if (changes.length === 0) return;
  await release?.();
  console.error(`${warningMark} The identities of ${context.environment} differ from the declared ones:`);
  for (const line of changes) console.error(`  ${tildeMark} ${line}`);
  console.error(
    `  They are IAM, which the operator key cannot write: \`${actionCommand('identity')}\` writes them with your Owner API key. Nothing applied.`,
  );
  endAction(1);
}

/** The policies on the environment's identities beside the declared ones: each widens what that identity may do, so Update identities deletes it. */
async function extraPolicies(auth: IamAuth, organizationId: string, declared: readonly MachinePolicy[]): Promise<ExtraPolicy[]> {
  const ids = new Map<string, string>();
  for (const policy of declared) {
    const id = await resolveApplicationIdByName(auth, organizationId, policy.applicationName);
    if (id) ids.set(id, policy.applicationName);
  }
  const names = new Set(declared.map((policy) => policy.name));
  return (await listOrganizationPolicies(auth, organizationId)).flatMap((policy) => {
    const application = policy.application_id ? ids.get(policy.application_id) : undefined;
    return application && !names.has(policy.name) ? [{ id: policy.id, name: policy.name, application }] : [];
  });
}

/**
 * The observer's policy as an identity update writes it, beside the environment's: the app's, which no apply depends on, so the machine part
 * an apply checks leaves it out. Empty while the app has no observer, as its creation writes it.
 */
async function observerPolicies(
  auth: IamAuth,
  organizationId: string,
  context: Pick<InfraContext, 'appConfig' | 'projectId'>,
): Promise<MachinePolicy[]> {
  const policy = await declaredObserverPolicy(auth, organizationId, context.appConfig.appSlug, context.projectId);
  return policy ? [policy] : [];
}

async function planIdentities(
  auth: IamAuth,
  organizationId: string,
  context: Pick<InfraContext, 'appConfig' | 'environment' | 'projectId'>,
): Promise<IdentityPlan> {
  const machine = await planMachineIdentities(auth, organizationId, context);
  const observer = await observerPolicies(auth, organizationId, context);
  return {
    ...machine,
    policies: [...machine.policies, ...(await planMachinePolicies(auth, organizationId, observer))],
    extraPolicies: await extraPolicies(auth, organizationId, declaredPolicies(context, organizationId)),
    observer: observerStep(observer.length > 0, context.environment),
    retiredAdmin: await retiredAdmin(auth, organizationId, context),
  };
}

/** Delete the retired admin application with its keys and policy, and the custody secret that held its key. */
async function deleteRetiredAdmin(
  ownerKey: OwnerKey,
  context: Pick<InfraContext, 'appConfig' | 'environment' | 'projectId'>,
  admin: RetiredAdmin,
): Promise<void> {
  await deleteApplicationCascade({ callerSecretKey: ownerKey.secretKey, organizationId: ownerKey.organizationId, applicationId: admin.id });
  const secrets = createSecretManagerClient({ secretKey: ownerKey.secretKey, region: context.appConfig.s3.region, projectId: context.projectId });
  const custody = await secrets.getSecretByName(ADMIN_KEY_SECRET_NAME, engineSecretPath(context.appConfig.slug, context.environment));
  if (custody) await secrets.deleteSecret(custody.id);
  console.info(`  ${changeMark} '${admin.name}' deleted, with its custody secret.`);
}

/**
 * Update identities: make the applications the service registry needs and write the machine policies and the observer's, at an Owner moment.
 * They are IAM, which neither the operator key nor the deploy key writes. The plan is read first with the observer key when this machine
 * holds it, so an Owner API key is asked for only when something has to change, and nothing but IAM runs on it.
 */
export async function runIdentity(context: InfraContext): Promise<void> {
  const { appConfig, projectId } = context;
  const registry = { slug: appConfig.slug, mode: context.environment };
  const names = appPrincipalNames(appConfig.appSlug);
  console.info(
    pc.dim(
      `\n${actionLabel('identity')}: the applications the service registry needs, the machine policies and the observer, written with your Owner API key.\n`,
    ),
  );

  const show = (plan: IdentityPlan): boolean => {
    if (plan.retiredAdmin && !plan.retiredAdmin.removable) {
      console.info(pc.dim(`'${plan.retiredAdmin.name}' is retired and stays until an apply has let the operator and the observer into the buckets.`));
    }
    if (identityPlanIsEmpty(plan)) {
      console.info(`${checkMark} The identities of ${context.environment} are as declared.`);
      return false;
    }
    console.info(`Changes in ${context.environment}:`);
    for (const line of identityPlanLines(plan, names)) console.info(`  ${tildeMark} ${line}`);
    return true;
  };

  const { observer } = resolveOperatorIdentity();
  let plan: IdentityPlan | undefined;
  if (observer) {
    const organizationId = await organizationIdOfKey(observer, projectId);
    const auth = { secretKey: observer.secretKey };
    plan = await planIdentities(auth, organizationId, context);
    if (!show(plan)) return;
    if (!(await confirmOrDefault({ message: 'Write them with your Owner API key?', default: false }))) return;
  }

  const ownerKey = await acquireIdentityKey(context, 'Updating identities writes applications and policies.');
  try {
    const auth = { secretKey: ownerKey.secretKey };
    if (!plan) {
      plan = await planIdentities(auth, ownerKey.organizationId, context);
      if (!show(plan)) return;
      if (!(await confirmOrDefault({ message: 'Write them?', default: false }))) return;
    }
    await ensureMachineIdentities({ ...registry, callerSecretKey: ownerKey.secretKey, projectId, organizationId: ownerKey.organizationId });
    await writeMachinePolicies(auth, ownerKey.organizationId, [
      ...declaredPolicies(context, ownerKey.organizationId),
      ...(await observerPolicies(auth, ownerKey.organizationId, context)),
    ]);
    await writeMachineKeys({
      auth,
      secrets: secretsFor(context, ownerKey.secretKey),
      organizationId: ownerKey.organizationId,
      projectId,
      ...registry,
      steps: plan.keys,
    });
    for (const policy of plan.extraPolicies) {
      await scwSend(auth, 'DELETE', `${IAM_BASE}/policies/${policy.id}`);
      console.info(`  ${changeMark} Deleted ${policy.name} from ${policy.application}.`);
    }
    if (plan.observer !== 'none') await ensureObserverForEnvironment(context, ownerKey, projectId);
    if (plan.retiredAdmin?.removable) await deleteRetiredAdmin(ownerKey, context, plan.retiredAdmin);
    console.info(`${checkMark} The identities of ${context.environment} are written.`);
  } finally {
    await ownerKey.release();
  }
  printRevokeReminder();
}
