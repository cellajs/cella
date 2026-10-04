import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { select } from '@inquirer/prompts';
import { dbExposureConfigured } from '../lib/db-public-endpoint';
import { CATEGORY_LABELS } from '../lib/operator-actions';
import { resolveOperatorIdentity } from '../lib/scaleway/operator-identity';
import { detectComputeDeferred, pickStackShort } from '../lib/stack/bootstrap-stack-state';
import { loadStackContext } from '../lib/stack/stack-context';
import { crossMark, failWithHint, pc, printHeader, warningMark, withSpinner } from '../lib/utils/cli-output';
import { loadBaseEnvFiles } from '../lib/utils/env-files';
import { infraDir } from '../lib/utils/paths';
import { installedPulumiVersion, pulumiCliLagWarning, sdkPulumiVersion } from '../lib/utils/pulumi-version';
import { runApply } from './actions/apply';
import { liveDbEndpoints, runExposeDatabase, runUnexposeDatabase } from './actions/db-exposure';
import { runFetchAdminKey } from './actions/fetch-admin-key';
import { runGeoipRefresh } from './actions/geoip-refresh';
import { runPreview } from './actions/preview';
import { runResetDatabase } from './actions/reset-database';
import { runRotatePassphrase } from './actions/rotate-passphrase';
import { runSecrets } from './actions/secrets';
import { runSeedDatabase } from './actions/seed-db';
import { runSetup } from './actions/setup';
import { runStorePassphrase } from './actions/store-passphrase';
import { runTeardown } from './actions/teardown';
import { runUnlock } from './actions/unlock';
import { actionChoices, BACK, categoryChoices, formatStackLine, type MenuAction, type MenuState, QUIT } from './menu';
import { installPromptAbortHandler } from './prompts/abort';
import type { InfraContext } from './shared';
import { autoAcceptDefaults, nonInteractive } from './shared';

// Load backend/.env before the root fallback so infra child tasks share the app's local config; ambient env keeps precedence over both files.
loadBaseEnvFiles();

// A Ctrl-C at any prompt below ends the run with one line and releases a held stack lock.
installPromptAbortHandler();

/**
 * The target mode. INFRA_MODE (or --mode) selects it explicitly, including a fresh stack with no Pulumi.<mode>.yaml yet;
 * otherwise the only existing stack file wins silently, two existing stack files ask once (and fail non-interactively), and with no stack
 * file an interactive install asks, defaulting to staging.
 * A mode-scoped `infra/.env.<mode>` OVERRIDES the ambient env, so a staging run cannot inherit production keys from backend/.env.
 */
async function resolveMode(): Promise<'production' | 'staging'> {
  const flagIndex = process.argv.indexOf('--mode');
  const raw = (flagIndex >= 0 ? process.argv[flagIndex + 1] : undefined) ?? process.env.INFRA_MODE;
  if (raw) {
    if (raw !== 'production' && raw !== 'staging') throw new Error(`INFRA_MODE must be 'production' or 'staging' (got '${raw}')`);
    return raw;
  }
  const anyStackExists = (['production', 'staging'] as const).some((name) => existsSync(resolve(infraDir, `Pulumi.${name}.yaml`)));
  if (!anyStackExists && !autoAcceptDefaults()) {
    return select<'production' | 'staging'>({
      message: 'Fresh install. Which mode do you want to set up?',
      default: 'staging',
      choices: [
        {
          name: 'staging (recommended)',
          value: 'staging',
          description: 'Cheapest setup, disposable. Validate the pipeline here first.',
        },
        {
          name: 'production',
          value: 'production',
          description: 'The real thing. Promote here later once staging is green.',
        },
      ],
    });
  }
  const existing = (['production', 'staging'] as const).filter((name) => existsSync(resolve(infraDir, `Pulumi.${name}.yaml`)));
  if (existing.length === 2) {
    if (autoAcceptDefaults()) {
      throw new Error('Both Pulumi.production.yaml and Pulumi.staging.yaml exist: pass --mode (or set INFRA_MODE).');
    }
    return select<'production' | 'staging'>({ message: 'Which stack?', choices: existing.map((name) => ({ name, value: name })) });
  }
  return pickStackShort((name) => existsSync(resolve(infraDir, `Pulumi.${name}.yaml`)));
}

async function loadContext(): Promise<InfraContext> {
  const environment = await resolveMode();
  const stack = await loadStackContext(environment, (message) => console.info(pc.dim(message)));
  // The project id scopes every Scaleway call. Only a fresh install may lack one: the setup wizard picks or creates the project and writes SCW_PROJECT_ID to backend/.env.
  if (!stack.projectId && stack.state !== 'fresh') {
    throw new Error('SCW_PROJECT_ID is not set: add it to backend/.env before running the infra CLI.');
  }
  return { ...stack, hasCiKey: stack.state === 'bootstrapped' };
}

printHeader('infra cli');

const pulumiVersion = installedPulumiVersion();
if (!pulumiVersion) {
  failWithHint('pulumi CLI not found', {
    command: 'brew install pulumi/tap/pulumi',
    description: 'the infra CLI needs Pulumi for every stack operation',
  });
}
// CI runs the CLI at the SDK version (.github/actions/pulumi-cli); a laptop that trails it sees a nag from Pulumi and, in the worst case, a state written by a newer engine.
const pulumiLag = pulumiCliLagWarning(pulumiVersion, sdkPulumiVersion());
if (pulumiLag) console.warn(`${warningMark} ${pulumiLag}`);

const context = await loadContext();

// Fail on an apex-hosted frontend before any prompt or provisioning step; the LB module cannot serve the app at the zone apex, and `pulumi up` only throws once half a deploy has run.
{
  const { frontendApexIssue } = await import('../lib/naming');
  const apexIssue = frontendApexIssue(context.appConfig);
  if (apexIssue) {
    console.error(`${crossMark} ${apexIssue}`);
    process.exit(1);
  }
}

console.info(`${formatStackLine({ slug: context.appConfig.slug, environment: context.environment, state: context.state })}\n`);

// One line per key misconfiguration (a superseded name in the env file, SCW_OWNER_* holding the admin key, …) before any action trips over it.
for (const warning of [...context.envWarnings, ...resolveOperatorIdentity().warnings]) console.warn(`${warningMark} ${warning}`);

const deferredSince = detectComputeDeferred(context.stackYaml);
if (deferredSince) {
  console.warn(
    `${warningMark} ${pc.bold('Compute is currently deferred')} ${pc.dim(`(bootstrap:computeDeferred = ${deferredSince})`)}.\n` +
      '  A fresh provision sets this so VMs are not declared until images exist;\n' +
      '  it clears automatically on the next successful provisioning `pulumi up`.\n',
  );
}

// Two-level action menu: the main menu, then the actions of one submenu, with Back returning to the top. Rows come from cli/menu.ts: a row that
// cannot run now stays listed with the reason, and the two DB access actions share one row that follows the local exposure config and, when the
// admin application key reads them in time, the instance's live public endpoints.
async function chooseAction(ctx: InfraContext): Promise<MenuAction> {
  const { runStatus } = await import('../tasks/status');
  const state: MenuState = {
    stackState: ctx.state,
    environment: ctx.environment,
    encrypted: !!ctx.stackYaml && /^encryptionsalt:/m.test(ctx.stackYaml),
    hasAdminKey: !!resolveOperatorIdentity().admin,
    dbExposed: dbExposureConfigured(ctx.environment, ctx.stackYaml),
  };
  while (true) {
    const category = await select({ message: 'How would you like to proceed?', default: 'status', loop: false, choices: categoryChoices() });
    if (category === QUIT) process.exit(0);
    // Status is read-only, so it runs in place and returns to the menu.
    if (category === 'status') {
      await runStatus(ctx);
      console.info('');
      continue;
    }
    const liveEndpoints = category === 'database' ? await withSpinner('Reading the database endpoints', () => liveDbEndpoints(ctx)) : undefined;
    const action = await select({
      message: CATEGORY_LABELS[category],
      loop: false,
      pageSize: 10,
      choices: actionChoices(category, { ...state, liveEndpoints }),
    });
    if (action !== BACK) return action;
  }
}

// What an operator wants to know before choosing: is the stack locked, what is live, and which key this machine holds. Bounded, best-effort.
if (context.state === 'bootstrapped' && !nonInteractive()) {
  const { printQuickFacts } = await import('../tasks/status');
  await printQuickFacts(context);
}

const mode: MenuAction = context.state === 'fresh' || nonInteractive() ? 'resume' : await chooseAction(context);

if (mode === 'apply') {
  await runApply(context);
  process.exit(0);
}

if (mode === 'rotate-passphrase') {
  await runRotatePassphrase(context);
  process.exit(0);
}

if (mode === 'preview') {
  await runPreview(context);
  process.exit(0);
}

if (mode === 'secrets') {
  await runSecrets(context);
  process.exit(0);
}

if (mode === 'reset-database') {
  await runResetDatabase(context);
  process.exit(0);
}

if (mode === 'geoip-refresh') {
  await runGeoipRefresh(context);
  process.exit(0);
}

if (mode === 'seed-db') {
  await runSeedDatabase(context);
  process.exit(0);
}

if (mode === 'expose-db') {
  await runExposeDatabase(context);
  process.exit(0);
}

if (mode === 'unexpose-db') {
  await runUnexposeDatabase(context);
  process.exit(0);
}

if (mode === 'unlock') {
  await runUnlock(context);
  process.exit(0);
}

if (mode === 'fetch-admin-key') {
  await runFetchAdminKey(context);
  process.exit(0);
}

if (mode === 'store-passphrase') {
  await runStorePassphrase(context);
  process.exit(0);
}

if (mode === 'teardown') {
  await runTeardown(context);
  process.exit(0);
}

await runSetup(context, mode);
