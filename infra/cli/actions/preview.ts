import { spawnSync } from 'node:child_process';
import { buildProviderEnv, stateKeyOverrideFromEnv } from '../../lib/scaleway/bootstrap-scw-env';
import { resolveOrganizationId } from '../../lib/scaleway/scaleway-iam';
import { PRIVILEGED_UP_ENV } from '../../lib/stack/privileged-up';
import { pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { infraDir } from '../../lib/utils/paths';
import { maskedSecret } from '../prompts/masked-secret';
import {
  envOr,
  type InfraContext,
  promptRequiredInput,
  promptStackName,
  pulumiLoginAndSelect,
  resolveVerifiedPassphrase,
} from '../shared';

/**
 * Read-only `pulumi preview` of what "Apply infra change" would apply, authenticating the provider from SCW_* env, not stack config, so it also
 * validates that env-based auth resolves. The standing admin key (infra/.env.<mode>) is enough: every read-only set plus the state bucket.
 * It builds the same environment as the privileged converge (organization id, state identity, privileged marker). A CI deploy applies the same
 * diff except the VM policy rules, which only a privileged run reconciles, so one simulation covers both.
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

  // Same split identity as Apply when SCW_STATE_* is set; otherwise the supplied key serves both sides, which the standing admin key can.
  const previewEnv = buildProviderEnv(infraDir, {
    accessKey,
    secretKey,
    projectId,
    passphrase,
    organizationId,
    ...stateKeyOverrideFromEnv(),
  });
  // The program diffs VM policy rules only under this marker, and that diff is the one an operator is here to see.
  previewEnv[PRIVILEGED_UP_ENV] = '1';
  pulumiLoginAndSelect(infraDir, previewEnv, appConfig, targetStack);

  console.info(
    `\n→ pulumi preview (what "Apply infra change" would apply)\n  $ pulumi preview --stack ${targetStack} --diff`,
  );
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
    `\n${pc.dim('Provider auth resolved from SCW_* env (see the "Using: Environment variable" lines above). A clean "no changes" result means the stack matches code; any diff is what "Apply infra change" would apply (a CI deploy applies the same minus VM policy rules).')}`,
  );
}
