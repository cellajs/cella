import { actionCommand, actionLabel } from '../../lib/operator-actions';
import type { DeclaredPolicy } from '../../lib/scaleway/declared-identities';
import { declaredIdentities } from '../../lib/scaleway/declared-identities';
import { IAM_BASE, type IamAuth } from '../../lib/scaleway/iam-client';
import { organizationIdOfKey, resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { type AppPrincipalNames, appPrincipalNames, principalNames } from '../../lib/scaleway/principals';
import { ensureApplication } from '../../lib/scaleway/scaleway-iam';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { scwSend } from '../../lib/scaleway/scw-fetch';
import { changeMark, checkMark, pc, tildeMark, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { planDeclaredPolicies, writeDeclaredPolicies } from '../../tasks/declared-policies';
import { type IdentityChanges, identityChangeLines, planIdentityChanges } from '../../tasks/identity-plan';
import { declaredObserverPolicy } from '../../tasks/setup-observer-app';
import { writeUploadsKey } from '../../tasks/uploads-key';
import { confirmOrDefault, endAction, type InfraContext } from '../shared';
import { ensureObserverForEnvironment, type ObserverStep, observerStep } from './observer-key';
import { acquireIdentityKey } from './operator-unlock';
import { printRevokeReminder } from './owner-key';

/** What an identity update would change: the identity plan with the observer's policy among its policies, and the observer's step on this machine. */
export interface IdentityPlan extends IdentityChanges {
  observer: ObserverStep;
}

/** True when the plan changes nothing. */
export function identityPlanIsEmpty(plan: IdentityPlan): boolean {
  return (
    plan.missingApplications.length === 0 &&
    plan.policies.every((step) => step.change === 'none') &&
    (plan.uploadsKey?.change ?? 'none') === 'none' &&
    plan.extraPolicies.length === 0 &&
    plan.observer === 'none'
  );
}

/** The plan as lines to print. */
function identityPlanLines(plan: IdentityPlan, names: Pick<AppPrincipalNames, 'observer'>): string[] {
  const observerWords: Record<ObserverStep, string | undefined> = {
    none: undefined,
    create: 'to create, its key written to this machine',
    key: 'a key for this machine',
  };
  const observer = observerWords[plan.observer];
  return [...identityChangeLines(plan), ...(observer ? [`observer ${names.observer}: ${observer}`] : [])];
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
 * End a run on the operator key when the identities differ from the declared ones: they are IAM, which that key cannot write, and an `up`
 * would fail on them halfway. `release` lets go of what the run holds first.
 */
export async function exitOnIdentityChanges(
  context: Pick<InfraContext, 'appConfig' | 'environment' | 'projectId'>,
  key: { secretKey: string; organizationId: string },
  release?: () => Promise<void>,
): Promise<void> {
  const plan = await planChanges(context, key.secretKey, key.organizationId).catch((error) => {
    console.warn(`${warningMark} Could not read the identities (${errorMessage(error)}).`);
    return undefined;
  });
  const changes = plan ? identityChangeLines(plan) : [];
  if (changes.length === 0) return;
  await release?.();
  console.error(`${warningMark} The identities of ${context.environment} differ from the declared ones:`);
  for (const line of changes) console.error(`  ${tildeMark} ${line}`);
  console.error(`  \`${actionCommand('identity')}\` writes them. Nothing applied.`);
  endAction(1);
}

/**
 * The observer's policy as an identity update writes it, beside the environment's: the app's, which no apply depends on, so the part an
 * apply checks leaves it out. Empty while the app has no observer, as its creation writes it.
 */
async function observerPolicies(
  auth: IamAuth,
  organizationId: string,
  context: Pick<InfraContext, 'appConfig' | 'projectId'>,
): Promise<DeclaredPolicy[]> {
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
    policies: [...changes.policies, ...(await planDeclaredPolicies(auth, organizationId, observer))],
    observer: observerStep(observer.length > 0, context.environment),
  };
}

/**
 * Update identities: make the applications the code declares, write their policies and the observer's, and make the uploads key, at an
 * Owner moment. They are IAM, which neither the operator key nor the deploy key writes. An Owner API key is asked for only when something
 * has to change: the plan is read first with the observer key when this machine holds it.
 */
export async function runIdentity(context: InfraContext): Promise<void> {
  const { appConfig, projectId } = context;
  const registry = { slug: appConfig.slug, mode: context.environment };
  const names = appPrincipalNames(appConfig.appSlug);
  console.info(pc.dim(`\n${actionLabel('identity')}: write what differs from the declared identities.\n`));

  const show = (plan: IdentityPlan): boolean => {
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
    // The setup makes the deploy application with its key; the uploads application is the one Update identities makes.
    const { uploads } = principalNames(appConfig.slug, context.environment);
    if (plan.missingApplications.includes(uploads)) {
      await ensureApplication(
        { ...registry, callerSecretKey: ownerKey.secretKey, projectId, organizationId: ownerKey.organizationId },
        { suffix: 'uploads', description: "The uploads key: signs the backend's uploads and presigned URLs" },
      );
    }
    await writeDeclaredPolicies(auth, ownerKey.organizationId, [
      ...declaredIdentities(registry, { projectId, organizationId: ownerKey.organizationId }).policies,
      ...(await observerPolicies(auth, ownerKey.organizationId, context)),
    ]);
    if (plan.uploadsKey) {
      const secrets = secretsFor(context, ownerKey.secretKey);
      await writeUploadsKey({ auth, secrets, organizationId: ownerKey.organizationId, projectId, step: plan.uploadsKey });
    }
    for (const policy of plan.extraPolicies) {
      await scwSend(auth, 'DELETE', `${IAM_BASE}/policies/${policy.id}`);
      console.info(`  ${changeMark} Deleted ${policy.name} from ${policy.application}.`);
    }
    if (plan.observer !== 'none') await ensureObserverForEnvironment(context, ownerKey, projectId);
    console.info(`${checkMark} The identities of ${context.environment} are written.`);
  } finally {
    await ownerKey.release();
  }
  printRevokeReminder();
}
