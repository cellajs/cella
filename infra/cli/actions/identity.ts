import { actionLabel } from '../../lib/operator-actions';
import type { IamAuth } from '../../lib/scaleway/iam-client';
import { type MachinePolicy, machinePolicies } from '../../lib/scaleway/machine-policies';
import { organizationIdOfKey, resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { checkMark, pc, tildeMark } from '../../lib/utils/cli-output';
import { type MachinePolicyStep, planMachinePolicies, writeMachinePolicies } from '../../tasks/machine-policies';
import { ensureRegistryPrincipals, missingRegistryPrincipals } from '../../tasks/setup-service-apps';
import { confirmOrDefault, type InfraContext } from '../shared';
import { acquireIdentityKey } from './operator-unlock';
import { printRevokeReminder } from './owner-key';

/** What an identity update would change: the applications the registry needs and lacks, and each machine policy's step. */
export interface IdentityPlan {
  missingApplications: string[];
  policies: MachinePolicyStep[];
}

/** True when the plan changes nothing. */
export function identityPlanIsEmpty(plan: IdentityPlan): boolean {
  return plan.missingApplications.length === 0 && plan.policies.every((step) => step.change === 'none');
}

/** The plan as lines to print. */
export function identityPlanLines(plan: IdentityPlan): string[] {
  const words: Record<MachinePolicyStep['change'], string> = {
    none: 'as declared',
    create: 'to create',
    update: 'rules to replace',
    'missing-application': 'to create once its application exists',
  };
  return [
    ...plan.missingApplications.map((name) => `application ${name}: to create`),
    ...plan.policies.filter((step) => step.change !== 'none').map((step) => `policy ${step.policy}: ${words[step.change]}`),
  ];
}

async function planIdentities(
  auth: IamAuth,
  organizationId: string,
  registry: { slug: string; mode: string; singleVM: boolean },
  wanted: readonly MachinePolicy[],
): Promise<IdentityPlan> {
  return {
    missingApplications: await missingRegistryPrincipals({ ...registry, secretKey: auth.secretKey, organizationId }),
    policies: await planMachinePolicies(auth, organizationId, wanted),
  };
}

/**
 * Update identities: make the applications the service registry needs and write the machine policies, at an Owner moment. They are IAM, which
 * neither the operator key nor the deploy key writes. The plan is read first with the admin application key when this machine holds it, so an
 * Owner API key is asked for only when something has to change, and nothing but IAM runs on it.
 */
export async function runIdentity(context: InfraContext): Promise<void> {
  const { appConfig, projectId } = context;
  const registry = { slug: appConfig.slug, mode: context.environment, singleVM: appConfig.singleVM ?? false };
  const wanted = machinePolicies(appConfig, projectId);
  console.info(
    pc.dim(`\n${actionLabel('identity')}: the applications the service registry needs and the machine policies, written with your Owner API key.\n`),
  );

  const show = (plan: IdentityPlan): boolean => {
    if (identityPlanIsEmpty(plan)) {
      console.info(`${checkMark} The applications and machine policies of ${context.environment} are as declared.`);
      return false;
    }
    console.info(`Changes in ${context.environment}:`);
    for (const line of identityPlanLines(plan)) console.info(`  ${tildeMark} ${line}`);
    return true;
  };

  const { admin } = resolveOperatorIdentity();
  if (admin) {
    const organizationId = await organizationIdOfKey(admin, projectId);
    if (!show(await planIdentities({ secretKey: admin.secretKey }, organizationId, registry, wanted))) return;
    if (!(await confirmOrDefault({ message: 'Write them with your Owner API key?', default: false }))) return;
  }

  const ownerKey = await acquireIdentityKey(context, 'Updating identities writes applications and policies.');
  try {
    const auth = { secretKey: ownerKey.secretKey };
    if (!admin) {
      if (!show(await planIdentities(auth, ownerKey.organizationId, registry, wanted))) return;
      if (!(await confirmOrDefault({ message: 'Write them?', default: false }))) return;
    }
    await ensureRegistryPrincipals({ ...registry, callerSecretKey: ownerKey.secretKey, projectId, organizationId: ownerKey.organizationId });
    await writeMachinePolicies(auth, ownerKey.organizationId, wanted);
    console.info(`${checkMark} The applications and machine policies of ${context.environment} are written.`);
  } finally {
    await ownerKey.release();
  }
  if (ownerKey.pasted) printRevokeReminder();
}
