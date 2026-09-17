import { spawnSync } from 'node:child_process';
import { select } from '@inquirer/prompts';
import { buildProviderEnv, stateKeyOverrideFromEnv } from '../../lib/scaleway/bootstrap-scw-env';
import { resolveOrganizationId } from '../../lib/scaleway/scaleway-iam';
import { isPrivilegedUp, PRIVILEGED_UP_ENV } from '../../lib/stack/privileged-up';
import { pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { infraDir } from '../../lib/utils/paths';
import { maskedSecret } from '../prompts/masked-secret';
import {
  autoAcceptDefaults,
  envOr,
  type InfraContext,
  promptRequiredInput,
  promptStackName,
  pulumiLoginAndSelect,
  resolveVerifiedPassphrase,
} from '../shared';

/** Which run the preview simulates. The Pulumi program diffs bootstrap-owned VM policy rules only under the privileged marker, so the two runs can differ exactly there. */
type PreviewRun = 'operator' | 'ci';

/** A marker already in the environment decides; otherwise prompt, defaulting to the operator run, the diff an Apply infra change would apply. */
async function choosePreviewRun(): Promise<PreviewRun> {
  if (process.env[PRIVILEGED_UP_ENV] !== undefined) return isPrivilegedUp() ? 'operator' : 'ci';
  if (autoAcceptDefaults()) return 'operator';
  return select<PreviewRun>({
    message: 'Which run should the preview simulate?',
    loop: false,
    choices: [
      {
        name: 'Apply infra change',
        value: 'operator',
        description: 'Bootstrap-keyed run: VM IAM policy rules are reconciled, so a registry change shows as ~rules.',
      },
      {
        name: 'CI deploy',
        value: 'ci',
        description: 'CI-keyed run: policy rules are ignored, matching what a release deploy applies.',
      },
    ],
  });
}

/**
 * Read-only `pulumi preview`, authenticating the provider from SCW_* env, not stack config, so it also validates that env-based auth resolves.
 * Any key with read access works, and nothing is mutated. It builds the same environment as the privileged converge (organization id, split state
 * identity, privileged marker), so what it shows is what that run would apply.
 */
export async function runPreview(context: InfraContext): Promise<void> {
  if (context.state !== 'bootstrapped') {
    console.error(
      `${warningMark} "Preview" requires a fully bootstrapped stack (state=${context.state}). Run Resume first.`,
    );
    process.exit(1);
  }
  console.info(
    pc.dim('\nPreview: read-only `pulumi preview` with a Scaleway key (supplied via env). No changes are made.\n'),
  );

  const passphrase = await resolveVerifiedPassphrase(context.stackYaml);

  const { projectId, appConfig } = context;

  const accessKey = await envOr('SCW_ACCESS_KEY', () =>
    promptRequiredInput('Scaleway access key (read access is enough)'),
  );
  const secretKey = await envOr('SCW_SECRET_KEY', () => maskedSecret({ message: 'Scaleway secret key' }));

  const targetStack = await promptStackName(context);
  const run = await choosePreviewRun();

  // The Pulumi program requires the organization id (pulumi-context.ts requireEnv): SCW_ORGANIZATION_ID / SCW_DEFAULT_ORGANIZATION_ID from the env, else the Account API.
  let organizationId: string;
  try {
    organizationId = await resolveOrganizationId(secretKey, projectId);
  } catch (error) {
    console.error(
      `${warningMark} Could not resolve the organization id (${errorMessage(error)}). Set SCW_ORGANIZATION_ID (backend/.env) or SCW_DEFAULT_ORGANIZATION_ID and re-run.`,
    );
    process.exit(1);
  }

  // Same split identity as Apply: the state bucket admits only the CI deploy and admin applications, so a bootstrap key previews with SCW_STATE_* on the state side.
  const previewEnv = buildProviderEnv(infraDir, {
    accessKey,
    secretKey,
    projectId,
    passphrase,
    organizationId,
    ...stateKeyOverrideFromEnv(),
  });
  previewEnv[PRIVILEGED_UP_ENV] = run === 'operator' ? '1' : '0';
  pulumiLoginAndSelect(infraDir, previewEnv, appConfig, targetStack);

  const runLabel = run === 'operator' ? 'an Apply infra change' : 'a CI deploy';
  console.info(`\n→ pulumi preview (simulating ${runLabel})\n  $ pulumi preview --stack ${targetStack} --diff`);
  const preview = spawnSync('pulumi', ['preview', '--stack', targetStack, '--diff'], {
    cwd: infraDir,
    env: previewEnv,
    stdio: 'inherit',
  });
  if (preview.status !== 0) {
    console.error(
      `\n${warningMark} pulumi preview exited ${preview.status}. Check provider auth (SCW_* env) and the passphrase.`,
    );
    process.exit(preview.status ?? 1);
  }
  console.info(
    `\n${pc.dim(`Provider auth resolved from SCW_* env (see the "Using: Environment variable" lines above). A clean "no changes" result means the stack matches code for ${runLabel}; any diff is what that run would apply.`)}`,
  );
}
