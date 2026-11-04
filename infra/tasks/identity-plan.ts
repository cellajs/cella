import { type DeclaredPolicy, declaredIdentities, declaresUploads } from '../lib/scaleway/declared-identities';
import { type IamAuth, listOrganizationApplications, listOrganizationPolicies, resolveApplicationIdByName } from '../lib/scaleway/iam-client';
import { isRetiredMachineApplication } from '../lib/scaleway/principals';
import { type DeclaredPolicyStep, planDeclaredPolicies } from './declared-policies';
import { planUploadsKey, type UploadsKeySecrets, type UploadsKeyStep } from './uploads-key';

/** A policy on one of the environment's identities beside the declared one, which no step of the engine writes. */
export interface ExtraPolicy {
  id: string;
  name: string;
  application: string;
}

/** Where an environment's identities differ from what its code declares; every list empty when they are as declared. */
export interface IdentityChanges {
  missingApplications: string[];
  policies: DeclaredPolicyStep[];
  /** The uploads key's step; absent where the registry declares no uploads application. */
  uploadsKey?: UploadsKeyStep;
  extraPolicies: ExtraPolicy[];
  /** The retired machine identities that still exist: a service's application or the builder's, each with its keys and policy. */
  retiredApplications: Array<{ id: string; name: string }>;
}

/** The policies on the declared identities beside the declared ones: each widens what its identity may do, so Update identities deletes it. */
async function extraPolicies(auth: IamAuth, organizationId: string, declared: readonly DeclaredPolicy[]): Promise<ExtraPolicy[]> {
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
 * The identity plan: where the deploy key and the uploads application differ from what the environment's code declares, in their
 * applications, policies and the uploads key, and the retired machine identities still there. Read with any key that reads IAM and secret
 * metadata; nothing is written. The apply reads it at its start, and Update identities writes what it names.
 */
export async function planIdentityChanges(opts: {
  auth: IamAuth;
  organizationId: string;
  projectId: string;
  slug: string;
  mode: string;
  secrets: Pick<UploadsKeySecrets, 'getSecretByName'>;
}): Promise<IdentityChanges> {
  const { auth, organizationId, slug, mode } = opts;
  const declared = declaredIdentities({ slug, mode }, { projectId: opts.projectId, organizationId });
  const missingApplications: string[] = [];
  for (const name of declared.applications) if (!(await resolveApplicationIdByName(auth, organizationId, name))) missingApplications.push(name);
  return {
    missingApplications,
    policies: await planDeclaredPolicies(auth, organizationId, declared.policies),
    ...(declaresUploads() ? { uploadsKey: await planUploadsKey({ auth, secrets: opts.secrets, organizationId, slug, mode }) } : {}),
    extraPolicies: await extraPolicies(auth, organizationId, declared.policies),
    retiredApplications: (await listOrganizationApplications(auth, organizationId)).filter((application) =>
      isRetiredMachineApplication(application.name, slug, mode),
    ),
  };
}

/** The changes as lines to print. */
export function identityChangeLines(changes: IdentityChanges): string[] {
  const words: Record<DeclaredPolicyStep['change'], string> = {
    none: 'as declared',
    create: 'to create',
    update: 'rules to replace',
    'missing-application': 'to create once its application exists',
  };
  const key = changes.uploadsKey;
  return [
    ...changes.missingApplications.map((name) => `application ${name}: to create`),
    ...changes.policies.filter((step) => step.change !== 'none').map((step) => `policy ${step.policy}: ${words[step.change]}`),
    ...(key?.change === 'make'
      ? [`uploads key of ${key.application}: to make${key.extra.length > 0 ? `, its ${key.extra.length} other key(s) deleted` : ''}`]
      : key?.change === 'prune'
        ? [`uploads key of ${key.application}: ${key.extra.length} key(s) beside it to delete`]
        : []),
    ...changes.extraPolicies.map((policy) => `policy ${policy.name} on ${policy.application}: beside the declared one, to delete`),
    ...changes.retiredApplications.map((application) => `application ${application.name}: retired, to delete with its keys and policy`),
  ];
}
