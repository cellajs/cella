import { IAM_BASE, type IamAuth, resolveApplicationIdByName } from '../lib/scaleway/iam-client';
import type { MachinePolicy } from '../lib/scaleway/machine-policies';
import { sameRules } from '../lib/scaleway/machine-policies';
import { scwFetch, scwSend } from '../lib/scaleway/scw-fetch';

/** What one machine policy needs: nothing, a policy made, its rules replaced, or its application made first. */
export interface MachinePolicyStep {
  policy: string;
  change: 'none' | 'create' | 'update' | 'missing-application';
}

interface LivePolicy {
  id: string;
  name: string;
  application_id?: string;
}

interface LiveRule {
  permission_set_names?: string[];
  project_ids?: string[];
  organization_id?: string | null;
  condition?: string | null;
}

async function livePolicy(auth: IamAuth, organizationId: string, name: string): Promise<LivePolicy | undefined> {
  const { policies = [] } = await scwFetch<{ policies?: LivePolicy[] }>(
    auth,
    'GET',
    `${IAM_BASE}/policies?organization_id=${organizationId}&policy_name=${encodeURIComponent(name)}&page_size=20`,
  );
  return policies.find((policy) => policy.name === name);
}

async function liveRules(auth: IamAuth, policyId: string): Promise<LiveRule[]> {
  const { rules = [] } = await scwFetch<{ rules?: LiveRule[] }>(auth, 'GET', `${IAM_BASE}/rules?policy_id=${policyId}&page_size=100`);
  return rules;
}

/** What writing the machine policies would change, read with any key that holds IAM read. Nothing is written. */
export async function planMachinePolicies(auth: IamAuth, organizationId: string, wanted: readonly MachinePolicy[]): Promise<MachinePolicyStep[]> {
  const steps: MachinePolicyStep[] = [];
  for (const policy of wanted) {
    if (!(await resolveApplicationIdByName(auth, organizationId, policy.applicationName))) {
      steps.push({ policy: policy.name, change: 'missing-application' });
      continue;
    }
    const live = await livePolicy(auth, organizationId, policy.name);
    if (!live) steps.push({ policy: policy.name, change: 'create' });
    else steps.push({ policy: policy.name, change: sameRules(await liveRules(auth, live.id), policy.rules) ? 'none' : 'update' });
  }
  return steps;
}

/**
 * Write the machine policies: create a missing one, and replace the rules of one that differs in place, so a machine keeps its rights in
 * between. Needs IAM write: an Owner API key. Every application must exist already (the registry principals are ensured first).
 */
export async function writeMachinePolicies(
  auth: IamAuth,
  organizationId: string,
  wanted: readonly MachinePolicy[],
  log: (message: string) => void = console.info,
): Promise<MachinePolicyStep[]> {
  const steps: MachinePolicyStep[] = [];
  for (const policy of wanted) {
    const applicationId = await resolveApplicationIdByName(auth, organizationId, policy.applicationName);
    if (!applicationId) throw new Error(`IAM application '${policy.applicationName}' does not exist, so '${policy.name}' cannot be written.`);
    const live = await livePolicy(auth, organizationId, policy.name);
    if (!live) {
      await scwFetch(auth, 'POST', `${IAM_BASE}/policies`, {
        name: policy.name,
        description: policy.description,
        organization_id: organizationId,
        application_id: applicationId,
        rules: policy.rules,
        tags: policy.tags,
      });
      log(`  created ${policy.name}`);
      steps.push({ policy: policy.name, change: 'create' });
      continue;
    }
    if (live.application_id && live.application_id !== applicationId) {
      throw new Error(`'${policy.name}' grants to another application than '${policy.applicationName}': fix it in the console.`);
    }
    if (sameRules(await liveRules(auth, live.id), policy.rules)) {
      steps.push({ policy: policy.name, change: 'none' });
      continue;
    }
    await scwSend(auth, 'PUT', `${IAM_BASE}/rules`, { policy_id: live.id, rules: policy.rules });
    log(`  updated the rules of ${policy.name}`);
    steps.push({ policy: policy.name, change: 'update' });
  }
  return steps;
}
