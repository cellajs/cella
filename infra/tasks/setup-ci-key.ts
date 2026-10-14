import { syncGithubEnvironment } from '../lib/github-sync';
import { deployRules } from '../lib/scaleway/deploy-policy';
import { principalNames } from '../lib/scaleway/principals';
import { resolveProjectId } from '../lib/scaleway/provider-env';
import { type ProvisionScopedKeyOptions, provisionScopedKey, type ScopedKeyResult } from '../lib/scaleway/scaleway-iam';
import { checkMark, DIVIDER, pc, warningMark } from '../lib/utils/cli-output';
import { isMain } from '../lib/utils/is-main';

export interface SetupCiKeyOptions extends ProvisionScopedKeyOptions {
  /** Deploy mode; per-mode CI apps keep staging/production keys independent. */
  mode: string;
}
export type CiKeyResult = ScopedKeyResult;

/** Create the scoped CI application, least-privilege policy, and fresh key. */
export async function setupCiKey(opts: SetupCiKeyOptions): Promise<CiKeyResult> {
  return provisionScopedKey(opts, {
    suffix: 'ci-deploy',
    appDescription: 'Non-human principal for GitHub Actions CI deployments',
    policyDescription: 'Least-privilege policy for CI deployments (auto-generated)',
    // The rights of plan §3.1 (lib/scaleway/deploy-policy.ts), which Update identities also writes in place.
    buildRules: ({ projectId, organizationId }) => deployRules({ slug: opts.slug, mode: opts.mode, projectId, organizationId }),
  });
}

// Standalone entry point.
if (isMain(import.meta.url)) {
  const secretKey = process.env.SCW_SECRET_KEY;
  const projectId = resolveProjectId();
  const organizationId = process.env.SCW_DEFAULT_ORGANIZATION_ID;

  if (!secretKey || !projectId) {
    process.stderr.write('Required: SCW_SECRET_KEY, SCW_PROJECT_ID\nOptional: SCW_DEFAULT_ORGANIZATION_ID\n');
    process.exit(1);
  }

  process.env.APP_MODE = process.env.APP_MODE ?? 'production';
  const { loadEngineConfig } = await import('../config/engine-config');
  const appConfig = await loadEngineConfig();

  console.info(`\n→ Setting up CI deploy key ('${principalNames(appConfig.slug, appConfig.mode).ciDeploy}')`);
  const result = await setupCiKey({
    callerSecretKey: secretKey,
    organizationId,
    projectId,
    slug: appConfig.slug,
    mode: appConfig.mode,
  });

  const divider = pc.dim(DIVIDER);
  console.info(`\n${divider}`);
  console.info(`${checkMark} ${pc.bold(pc.greenBright('CI key created.'))} ${pc.dim(`access key ${result.accessKey}`)}\n`);

  // The secret key must stay off stdout (terminal scrollback, CI transcripts);
  // push it straight to the GitHub Environment via gh.
  const environment = appConfig.mode === 'staging' ? 'staging' : 'production';
  const synced = await syncGithubEnvironment({
    repoRoot: process.cwd(),
    environment,
    ciKey: { accessKey: result.accessKey, secretKey: result.secretKey, projectId, organizationId: result.organizationId },
  });
  if (synced) {
    console.info(
      `\n${checkMark} SCW_* secrets pushed to the GitHub "${environment}" Environment. ${pc.dim('Revoke the key you ran this with if it was minted for it.')}`,
    );
  } else {
    console.error(
      `\n${warningMark} Could not push secrets to GitHub (gh unauthenticated or origin is not a GitHub remote).\n` +
        `  The secret key is intentionally not printed. Run ${pc.cyanBright('gh auth login')} and re-run this task: a fresh key is minted each run.`,
    );
    process.exitCode = 1;
  }
  console.info(divider);
}
