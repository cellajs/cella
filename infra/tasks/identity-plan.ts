import { actionCommand } from '../lib/operator-actions';
import { declaredIdentities } from '../lib/scaleway/declared-identities';
import { type IamAuth, listOrganizationPolicies, resolveApplicationIdByName } from '../lib/scaleway/iam-client';
import type { MachineKeyStep } from '../lib/scaleway/machine-keys';
import type { MachinePolicy } from '../lib/scaleway/machine-policies';
import { createSecretManagerClient } from '../lib/scaleway/scaleway-secret-manager';
import { ExitCodeError } from '../lib/utils/errors';
import { runIfMain } from '../lib/utils/is-main';
import { getFlag } from './args';
import { missingMachineIdentities } from './machine-identities';
import { type MachineKeySecrets, planMachineKeys } from './machine-keys';
import { type MachinePolicyStep, planMachinePolicies } from './machine-policies';

/** A policy on one of the environment's identities beside the declared one, which no step of the engine writes. */
export interface ExtraPolicy {
  id: string;
  name: string;
  application: string;
}

/** Where an environment's identities differ from what its code declares; every list empty when they are as declared. */
export interface IdentityChanges {
  missingApplications: string[];
  policies: MachinePolicyStep[];
  keys: MachineKeyStep[];
  extraPolicies: ExtraPolicy[];
}

/** The policies on the declared identities beside the declared ones: each widens what its identity may do, so Update identities deletes it. */
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
 * The identity plan: where the machine identities and the deploy key differ from what the environment's code declares, in their
 * applications, policies and standing keys. Read with any key that reads IAM and secret metadata, the deploy key's included; nothing is
 * written. The apply and the deploy read it at their start, and Update identities writes what it names.
 */
export async function planIdentityChanges(opts: {
  auth: IamAuth;
  organizationId: string;
  projectId: string;
  slug: string;
  mode: string;
  secrets: Pick<MachineKeySecrets, 'listSecrets' | 'listSecretsUnder'>;
}): Promise<IdentityChanges> {
  const { auth, organizationId, slug, mode } = opts;
  const declared = declaredIdentities({ slug, mode }, { projectId: opts.projectId, organizationId }).policies;
  return {
    missingApplications: await missingMachineIdentities({ secretKey: auth.secretKey, organizationId, slug, mode }),
    policies: await planMachinePolicies(auth, organizationId, declared),
    keys: await planMachineKeys({ auth, secrets: opts.secrets, organizationId, slug, mode }),
    extraPolicies: await extraPolicies(auth, organizationId, declared),
  };
}

/** The changes as lines to print. */
export function identityChangeLines(changes: IdentityChanges): string[] {
  const words: Record<MachinePolicyStep['change'], string> = {
    none: 'as declared',
    create: 'to create',
    update: 'rules to replace',
    'missing-application': 'to create once its application exists',
  };
  return [
    ...changes.missingApplications.map((name) => `application ${name}: to create`),
    ...changes.policies.filter((step) => step.change !== 'none').map((step) => `policy ${step.policy}: ${words[step.change]}`),
    ...changes.keys.flatMap((step) =>
      step.change === 'make'
        ? [`standing key of ${step.application}: to make${step.extra.length > 0 ? `, its ${step.extra.length} other key(s) deleted` : ''}`]
        : step.change === 'prune'
          ? [`standing key of ${step.application}: ${step.extra.length} key(s) beside it to delete`]
          : [],
    ),
    ...changes.extraPolicies.map((policy) => `policy ${policy.name} on ${policy.application}: beside the declared one, to delete`),
  ];
}

/**
 * The deploy's first check, on the deploy key: identities that differ from the declared ones end the run blocked before it changes
 * anything, as only Update identities, at an Owner moment, writes them.
 * @throws ExitCodeError with code 2 when the identities differ
 */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const secretKey = process.env.SCW_SECRET_KEY;
  const projectId = getFlag(argv, '--project-id');
  const organizationId = getFlag(argv, '--organization-id');
  if (!secretKey || !projectId || !organizationId) throw new Error('Required: SCW_SECRET_KEY, --project-id, --organization-id');
  const { loadEngineConfig } = await import('../config/engine-config');
  const appConfig = await loadEngineConfig();
  const lines = identityChangeLines(
    await planIdentityChanges({
      auth: { secretKey },
      organizationId,
      projectId,
      slug: appConfig.slug,
      mode: appConfig.mode,
      secrets: createSecretManagerClient({ secretKey, region: appConfig.s3.region, projectId }),
    }),
  );
  if (lines.length > 0) {
    throw new ExitCodeError(
      `The identities of ${appConfig.mode} differ from the declared ones: ${lines.join('; ')}. Update identities writes them (\`${actionCommand('identity')}\`, an Owner API key), then an apply starts this target again.`,
      2,
    );
  }
  console.info('✓ the identities are as declared');
}

runIfMain(import.meta.url, main);
