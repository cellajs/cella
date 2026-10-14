import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { actionLabel } from '../../lib/operator-actions';
import { type IamAuth, resolveApplicationIdByName } from '../../lib/scaleway/iam-client';
import type { MachineKeyStep } from '../../lib/scaleway/machine-keys';
import { type MachinePolicy, machinePolicies } from '../../lib/scaleway/machine-policies';
import { organizationIdOfKey, resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { type PrincipalNames, principalNames } from '../../lib/scaleway/principals';
import { makeS3Client, projectAccessKey } from '../../lib/scaleway/s3-client';
import { deleteApplicationCascade } from '../../lib/scaleway/scaleway-iam';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { engineSecretPath } from '../../lib/scaleway/secret-paths';
import { stateBucket } from '../../lib/stack/control-store';
import { changeMark, checkMark, pc, tildeMark } from '../../lib/utils/cli-output';
import { ADMIN_KEY_SECRET_NAME } from '../../tasks/admit-operator-buckets';
import { planMachineKeys, writeMachineKeys } from '../../tasks/machine-keys';
import { type MachinePolicyStep, planMachinePolicies, writeMachinePolicies } from '../../tasks/machine-policies';
import { ensureRegistryPrincipals, missingRegistryPrincipals } from '../../tasks/setup-service-apps';
import { confirmOrDefault, type InfraContext } from '../shared';
import { ensureObserverForEnvironment, type ObserverStep, observerKeyHere, observerStep } from './observer-key';
import { acquireIdentityKey } from './operator-unlock';
import { type OwnerKey, printRevokeReminder } from './owner-key';

/** The retired admin application of an environment that still has it; removable once no bucket policy needs it (see `retiredAdmin`). */
export interface RetiredAdmin {
  name: string;
  id: string;
  removable: boolean;
}

/**
 * What an identity update would change: the applications the registry needs and lacks, each machine policy's step, each machine identity's
 * standing key, the observer's step, the retired admin.
 */
export interface IdentityPlan {
  missingApplications: string[];
  policies: MachinePolicyStep[];
  keys: MachineKeyStep[];
  observer: ObserverStep;
  retiredAdmin?: RetiredAdmin;
}

/** True when the plan changes nothing. A retired admin application that must stay is no change. */
export function identityPlanIsEmpty(plan: IdentityPlan): boolean {
  return (
    plan.missingApplications.length === 0 &&
    plan.policies.every((step) => step.change === 'none') &&
    plan.keys.every((step) => step.change === 'none') &&
    plan.observer === 'none' &&
    !plan.retiredAdmin?.removable
  );
}

/** The plan as lines to print. */
export function identityPlanLines(plan: IdentityPlan, names: Pick<PrincipalNames, 'observer'>): string[] {
  const words: Record<MachinePolicyStep['change'], string> = {
    none: 'as declared',
    create: 'to create',
    update: 'rules to replace',
    'missing-application': 'to create once its application exists',
  };
  const observerWords: Record<ObserverStep, string | undefined> = {
    none: undefined,
    create: 'to create, its key written to this machine',
    reach: 'to reach this environment, and its key written to this machine',
    key: 'a key for this machine',
  };
  const observer = observerWords[plan.observer];
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

async function planIdentities(
  auth: IamAuth,
  organizationId: string,
  context: Pick<InfraContext, 'appConfig' | 'environment' | 'projectId'>,
  wanted: readonly MachinePolicy[],
): Promise<IdentityPlan> {
  const registry = { slug: context.appConfig.slug, mode: context.environment };
  return {
    missingApplications: await missingRegistryPrincipals({ ...registry, secretKey: auth.secretKey, organizationId }),
    policies: await planMachinePolicies(auth, organizationId, wanted),
    keys: await planMachineKeys({ auth, secrets: secretsFor(context, auth.secretKey), organizationId, ...registry }),
    observer: await observerStep(auth, organizationId, context, context.projectId),
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
 * Update identities: make the applications the service registry needs and write the machine policies, at an Owner moment. They are IAM, which
 * neither the operator key nor the deploy key writes. The plan is read first with the admin application key when this machine holds it, so an
 * Owner API key is asked for only when something has to change, and nothing but IAM runs on it.
 */
export async function runIdentity(context: InfraContext): Promise<void> {
  const { appConfig, projectId } = context;
  const registry = { slug: appConfig.slug, mode: context.environment };
  const names = principalNames(appConfig.slug, context.environment);
  const wanted = machinePolicies(appConfig, projectId);
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
    plan = await planIdentities({ secretKey: observer.secretKey }, organizationId, context, wanted);
    if (!show(plan)) return;
    if (!(await confirmOrDefault({ message: 'Write them with your Owner API key?', default: false }))) return;
  }

  const ownerKey = await acquireIdentityKey(context, 'Updating identities writes applications and policies.');
  try {
    const auth = { secretKey: ownerKey.secretKey };
    if (!plan) {
      plan = await planIdentities(auth, ownerKey.organizationId, context, wanted);
      if (!show(plan)) return;
      if (!(await confirmOrDefault({ message: 'Write them?', default: false }))) return;
    }
    await ensureRegistryPrincipals({ ...registry, callerSecretKey: ownerKey.secretKey, projectId, organizationId: ownerKey.organizationId });
    await writeMachinePolicies(auth, ownerKey.organizationId, wanted);
    await writeMachineKeys({
      auth,
      secrets: secretsFor(context, ownerKey.secretKey),
      organizationId: ownerKey.organizationId,
      projectId,
      ...registry,
      steps: plan.keys,
    });
    if (plan.observer !== 'none') await ensureObserverForEnvironment(context, ownerKey, projectId);
    if (plan.retiredAdmin?.removable) await deleteRetiredAdmin(ownerKey, context, plan.retiredAdmin);
    console.info(`${checkMark} The identities of ${context.environment} are written.`);
  } finally {
    await ownerKey.release();
  }
  if (ownerKey.pasted) printRevokeReminder();
}
