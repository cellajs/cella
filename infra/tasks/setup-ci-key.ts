import { syncGithubEnvironment } from '../lib/github-sync';
import { resolveProjectId } from '../lib/scaleway/bootstrap-scw-env';
import { resolveDnsProjectIds } from '../lib/scaleway/dns-zone-project';
import { CI_RULE_SHAPES } from '../lib/scaleway/permissions';
import { type ProvisionScopedKeyOptions, provisionScopedKey, type ScopedKeyResult } from '../lib/scaleway/scaleway-iam';
import { checkMark, DIVIDER, pc, warningMark } from '../lib/utils/cli-output';
import { isMain } from '../lib/utils/is-main';

export interface SetupCiKeyOptions extends ProvisionScopedKeyOptions {
  /** The stack's DNS zone; scopes the DNS grant to the projects that serve it. */
  dnsZone?: string;
  /** Deploy mode; per-mode CI apps keep staging/production keys independent. */
  mode: string;
  /**
   * Service + boot application ids (v2 model): presence adds the key-mint
   * rule so CI can rotate service keys per deploy. The ids intentionally no
   * longer narrow the rule (see CI_KEY_MINT_PERMISSION_SETS for why and the
   * trade-off); they remain declared as the intended scope for a future
   * re-narrowing.
   */
  keyMintAppIds?: readonly string[];
}
export type CiKeyResult = ScopedKeyResult;

/** Create the scoped CI application, least-privilege policy, and fresh key. */
export async function setupCiKey(opts: SetupCiKeyOptions): Promise<CiKeyResult> {
  // DNS is project-scoped: the app project (fresh zones land there) plus the
  // serving zone's project when records live in a shared parent zone (staging
  // on the production apex). Never org-wide: a compromised CI key must not be
  // able to rewrite unrelated zones.
  const dnsProjectIds = await resolveDnsProjectIds(
    { secretKey: opts.callerSecretKey },
    opts.dnsZone ?? '',
    opts.projectId,
  );
  return provisionScopedKey(opts, {
    suffix: 'ci-deploy',
    appDescription: 'Non-human principal for GitHub Actions CI deployments',
    policyDescription: 'Least-privilege policy for CI deployments (auto-generated)',
    // One rule per CI_RULE_SHAPES entry (separate rules per scope type:
    // Scaleway rejects mixing scopes in one rule). The key-mint rule is
    // unconditioned: the resource.id condition 403s real api-key mints on
    // live Scaleway (disproven 2026-08-10; see CI_KEY_MINT_PERMISSION_SETS).
    buildRules: ({ projectId, organizationId }) =>
      CI_RULE_SHAPES.filter(
        (shape) => shape.id !== 'key-mint' || (opts.keyMintAppIds && opts.keyMintAppIds.length > 0),
      ).map((shape) =>
        shape.scope === 'project'
          ? { permission_set_names: [...shape.permissionSets], project_ids: [projectId] }
          : shape.scope === 'dns-projects'
            ? { permission_set_names: [...shape.permissionSets], project_ids: dnsProjectIds }
            : { permission_set_names: [...shape.permissionSets], organization_id: organizationId },
      ),
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

  console.info('\n→ Setting up CI deploy key');
  const { deriveInfra } = await import('../lib/naming');
  const result = await setupCiKey({
    callerSecretKey: secretKey,
    organizationId,
    projectId,
    slug: appConfig.slug,
    mode: appConfig.mode,
    dnsZone: deriveInfra(appConfig).dnsZone,
  });

  const divider = pc.dim(DIVIDER);
  console.info(`\n${divider}`);
  console.info(
    `${checkMark} ${pc.bold(pc.greenBright('CI key created.'))} ${pc.dim(`access key ${result.accessKey}`)}\n`,
  );

  // The secret key must stay off stdout (terminal scrollback, CI transcripts);
  // push it straight to the GitHub Environment via gh.
  const environment = appConfig.mode === 'staging' ? 'staging' : 'production';
  const synced = await syncGithubEnvironment({
    repoRoot: process.cwd(),
    environment,
    ciKey: {
      accessKey: result.accessKey,
      secretKey: result.secretKey,
      projectId,
      organizationId: result.organizationId,
    },
  });
  if (synced) {
    console.info(
      `\n${checkMark} SCW_* secrets pushed to the GitHub "${environment}" Environment. ${pc.dim('Then revoke the bootstrap key.')}`,
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
