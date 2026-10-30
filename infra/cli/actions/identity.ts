import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { actionCommand, actionLabel } from '../../lib/operator-actions';
import { declaredIdentities } from '../../lib/scaleway/declared-identities';
import { IAM_BASE, type IamAuth, resolveApplicationIdByName } from '../../lib/scaleway/iam-client';
import { machineKeyName } from '../../lib/scaleway/machine-keys';
import type { MachinePolicy } from '../../lib/scaleway/machine-policies';
import { organizationIdOfKey, resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { type AppPrincipalNames, appPrincipalNames, principalNames } from '../../lib/scaleway/principals';
import { makeS3Client, projectAccessKey } from '../../lib/scaleway/s3-client';
import { deleteApplicationCascade } from '../../lib/scaleway/scaleway-iam';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { scwSend } from '../../lib/scaleway/scw-fetch';
import { DEPLOY_FOLDER, ENGINE_FOLDER } from '../../lib/scaleway/secret-paths';
import { stateBucket } from '../../lib/stack/control-store';
import { changeMark, checkMark, pc, tildeMark, warningMark } from '../../lib/utils/cli-output';
import { ADMIN_KEY_SECRET_NAME } from '../../tasks/admit-operator-buckets';
import { type IdentityChanges, identityChangeLines, planIdentityChanges } from '../../tasks/identity-plan';
import { ensureMachineIdentities } from '../../tasks/machine-identities';
import { writeMachineKeys } from '../../tasks/machine-keys';
import { planMachinePolicies, writeMachinePolicies } from '../../tasks/machine-policies';
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

/** The retired boot application, `<slug>-<mode>-boot`, whose key every machine's cloud-init carried before each service key did. */
export interface RetiredBoot {
  name: string;
  id: string;
}

/** What an identity update would change: the identity plan with the observer's policy among its policies, the observer's step on this machine, the retired applications. */
export interface IdentityPlan extends IdentityChanges {
  observer: ObserverStep;
  retiredAdmin?: RetiredAdmin;
  retiredBoot?: RetiredBoot;
}

/** True when the plan changes nothing. A retired admin application that must stay is no change. */
export function identityPlanIsEmpty(plan: IdentityPlan): boolean {
  return (
    plan.missingApplications.length === 0 &&
    plan.policies.every((step) => step.change === 'none') &&
    plan.keys.every((step) => step.change === 'none') &&
    plan.extraPolicies.length === 0 &&
    plan.observer === 'none' &&
    !plan.retiredAdmin?.removable &&
    !plan.retiredBoot
  );
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
    ...identityChangeLines(plan),
    ...(observer ? [`observer ${names.observer}: ${observer}`] : []),
    ...(plan.retiredAdmin?.removable ? [`application ${plan.retiredAdmin.name}: retired, to delete with its keys and its custody secret`] : []),
    ...(plan.retiredBoot ? [`application ${plan.retiredBoot.name}: retired, to delete with its key, its standing key and its hand-over folder`] : []),
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

/** The environment's retired boot application, when it still exists. */
async function retiredBoot(
  auth: IamAuth,
  organizationId: string,
  context: Pick<InfraContext, 'appConfig' | 'environment'>,
): Promise<RetiredBoot | undefined> {
  const name = `${context.appConfig.slug}-${context.environment}-boot`;
  const id = await resolveApplicationIdByName(auth, organizationId, name);
  return id ? { name, id } : undefined;
}

/** A Secret Manager client in the environment's project. */
function secretsFor(context: Pick<InfraContext, 'appConfig' | 'projectId'>, secretKey: string) {
  return createSecretManagerClient({ secretKey, region: context.appConfig.s3.region, projectId: context.projectId });
}

/** The identity plan of the environment, read with `secretKey`. */
function planChanges(context: Pick<InfraContext, 'appConfig' | 'environment' | 'projectId'>, secretKey: string, organizationId: string) {
  return planIdentityChanges({
    auth: { secretKey },
    organizationId,
    projectId: context.projectId,
    slug: context.appConfig.slug,
    mode: context.environment,
    secrets: secretsFor(context, secretKey),
  });
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
  const plan = await planChanges(context, key.secretKey, key.organizationId).catch((error) => {
    console.warn(`${warningMark} Could not read the identities (${error instanceof Error ? error.message : String(error)}).`);
    return undefined;
  });
  const changes = plan ? identityChangeLines(plan) : [];
  if (changes.length === 0) return;
  await release?.();
  console.error(`${warningMark} The identities of ${context.environment} differ from the declared ones:`);
  for (const line of changes) console.error(`  ${tildeMark} ${line}`);
  console.error(
    `  They are IAM, which the operator key cannot write: \`${actionCommand('identity')}\` writes them with your Owner API key. Nothing applied.`,
  );
  endAction(1);
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
  const changes = await planChanges(context, auth.secretKey, organizationId);
  const observer = await observerPolicies(auth, organizationId, context);
  return {
    ...changes,
    policies: [...changes.policies, ...(await planMachinePolicies(auth, organizationId, observer))],
    observer: observerStep(observer.length > 0, context.environment),
    retiredAdmin: await retiredAdmin(auth, organizationId, context),
    retiredBoot: await retiredBoot(auth, organizationId, context),
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
  const custody = await secrets.getSecretByName(ADMIN_KEY_SECRET_NAME, ENGINE_FOLDER);
  if (custody) await secrets.deleteSecret(custody.id);
  console.info(`  ${changeMark} '${admin.name}' deleted, with its custody secret.`);
}

/** Delete the retired boot application with its key and policy, its standing key in the deploy folder, and every bundle left under `/handoff/`. */
async function deleteRetiredBoot(ownerKey: OwnerKey, context: Pick<InfraContext, 'appConfig' | 'projectId'>, boot: RetiredBoot): Promise<void> {
  await deleteApplicationCascade({ callerSecretKey: ownerKey.secretKey, organizationId: ownerKey.organizationId, applicationId: boot.id });
  const secrets = secretsFor(context, ownerKey.secretKey);
  const left = [
    ...(await secrets.listSecretsUnder(DEPLOY_FOLDER)).filter((secret) => secret.name === machineKeyName('boot')),
    ...(await secrets.listSecretsUnder('/handoff/')),
  ];
  for (const secret of left) await secrets.deleteSecret(secret.id);
  console.info(`  ${changeMark} '${boot.name}' deleted, with ${left.length} secret(s) it read or a deploy wrote for it.`);
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
      ...declaredIdentities(registry, { projectId, organizationId: ownerKey.organizationId }).policies,
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
    if (plan.retiredBoot) await deleteRetiredBoot(ownerKey, context, plan.retiredBoot);
    console.info(`${checkMark} The identities of ${context.environment} are written.`);
  } finally {
    await ownerKey.release();
  }
  printRevokeReminder();
}
