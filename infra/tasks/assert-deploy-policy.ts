import { actionCommand } from '../lib/operator-actions';
import { deployPolicy } from '../lib/scaleway/deploy-policy';
import { ExitCodeError } from '../lib/utils/errors';
import { runIfMain } from '../lib/utils/is-main';
import { getFlag } from './args';
import { planMachinePolicies } from './machine-policies';

/**
 * Compare the deploy key's own policy with the declared one, rule for rule, with the deploy key's IAM read. A policy that differs, wider or
 * narrower, ends the deploy blocked before it changes anything: only Update identities, at an Owner moment, may write it.
 * @throws ExitCodeError with code 2 when the policy differs, so the run ends blocked
 */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const secretKey = process.env.SCW_SECRET_KEY;
  const projectId = getFlag(argv, '--project-id');
  const organizationId = getFlag(argv, '--organization-id');
  if (!secretKey || !projectId || !organizationId) throw new Error('Required: SCW_SECRET_KEY, --project-id, --organization-id');
  const { loadEngineConfig } = await import('../config/engine-config');
  const appConfig = await loadEngineConfig();
  const policy = deployPolicy({ slug: appConfig.slug, mode: appConfig.mode, projectId, organizationId });
  const [step] = await planMachinePolicies({ secretKey }, organizationId, [policy]);
  if (step?.change !== 'none') {
    throw new ExitCodeError(
      `The deploy key's policy ${policy.name} is not the declared one (${step?.change ?? 'unread'}): Update identities rewrites it (\`${actionCommand('identity')}\`, an Owner API key), then an apply starts this target again.`,
      2,
    );
  }
  console.info(`✓ the deploy key's policy is the declared one`);
}

runIfMain(import.meta.url, main);
