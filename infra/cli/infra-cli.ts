import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { select } from '@inquirer/prompts';
import { resolveProjectId } from '../lib/scaleway/bootstrap-scw-env';
import {
  detectComputeDeferred,
  detectDbPublicEndpoint,
  detectStackState,
  pickStackShort,
} from '../lib/stack/bootstrap-stack-state';
import { failWithHint, pc, printHeader, warningMark } from '../lib/utils/cli-output';
import { loadBaseEnvFiles, loadModeEnvFile } from '../lib/utils/env-files';
import { infraDir } from '../lib/utils/paths';
import { runApply } from './actions/apply';
import { exposureOverlayPath, runExposeDatabase, runUnexposeDatabase } from './actions/db-exposure';
import { runPreview } from './actions/preview';
import { runResetDatabase } from './actions/reset-database';
import { runRotatePassphrase } from './actions/rotate-passphrase';
import { runSecrets } from './actions/secrets';
import { runSeedDatabase } from './actions/seed-db';
import { runSetup } from './actions/setup';
import { runTeardown } from './actions/teardown';
import { runUnlock } from './actions/unlock';
import type { CliMode, InfraContext } from './shared';
import { autoAcceptDefaults, nonInteractive } from './shared';

// Load backend/.env before the root fallback so infra child tasks share the app's local config; ambient env keeps precedence over both files.
loadBaseEnvFiles();

/**
 * The target mode. INFRA_MODE (or --mode) selects it explicitly, including a fresh stack with no Pulumi.<mode>.yaml yet;
 * otherwise the first existing stack file wins (production before staging), and with no stack file an interactive install asks, defaulting to staging.
 * A mode-scoped `infra/.env.<mode>` OVERRIDES the ambient env, so a staging run cannot inherit production credentials from backend/.env.
 */
async function resolveMode(): Promise<'production' | 'staging'> {
  const flagIndex = process.argv.indexOf('--mode');
  const raw = (flagIndex >= 0 ? process.argv[flagIndex + 1] : undefined) ?? process.env.INFRA_MODE;
  if (raw) {
    if (raw !== 'production' && raw !== 'staging')
      throw new Error(`INFRA_MODE must be 'production' or 'staging' (got '${raw}')`);
    return raw;
  }
  const anyStackExists = (['production', 'staging'] as const).some((name) =>
    existsSync(resolve(infraDir, `Pulumi.${name}.yaml`)),
  );
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
  return pickStackShort((name) => existsSync(resolve(infraDir, `Pulumi.${name}.yaml`)));
}

async function loadContext(): Promise<InfraContext> {
  const environment = await resolveMode();
  loadModeEnvFile(environment, (message) => console.info(pc.dim(message)));
  const stackPath = resolve(infraDir, `Pulumi.${environment}.yaml`);
  const stackYaml = existsSync(stackPath) ? readFileSync(stackPath, 'utf8') : undefined;
  const state = detectStackState({ yamlText: stackYaml });

  // The config reads APP_MODE during module evaluation, so the CLI-selected stack must be set first; it is authoritative for child tasks.
  process.env.APP_MODE = environment;
  const { loadEngineConfig } = await import('../config/engine-config');
  const appConfig = await loadEngineConfig();

  // Project id scopes all Scaleway API calls, so resolve it once from the env files loaded above.
  // Only a fresh install may lack one: the setup wizard picks or creates the project and writes SCW_PROJECT_ID to backend/.env. Every other state fails fast.
  const projectId = resolveProjectId();
  if (!projectId && state !== 'fresh') {
    throw new Error('SCW_PROJECT_ID is not set: add it to backend/.env before running the infra CLI.');
  }

  return {
    environment,
    stackPath,
    stackYaml,
    state,
    hasCiKey: state === 'bootstrapped',
    appConfig,
    projectId: projectId ?? '',
  };
}

printHeader('infra cli');

if (spawnSync('pulumi', ['version'], { stdio: 'ignore' }).status !== 0) {
  failWithHint('pulumi CLI not found', {
    command: 'brew install pulumi/tap/pulumi',
    description: 'the infra CLI needs Pulumi for every stack operation',
  });
}

const context = await loadContext();

// Fail on an apex-hosted frontend before any prompt or provisioning step; the LB module cannot serve the app at the zone apex, and `pulumi up` only throws once half a deploy has run.
{
  const { frontendApexIssue } = await import('../lib/naming');
  const apexIssue = frontendApexIssue(context.appConfig);
  if (apexIssue) {
    console.error(`\u2717 ${apexIssue}`);
    process.exit(1);
  }
}

console.info(`State: ${context.state}${context.state === 'fresh' ? '' : ` (Pulumi.${context.environment}.yaml)`}\n`);

const deferredSince = detectComputeDeferred(context.stackYaml);
if (deferredSince) {
  console.warn(
    `${warningMark} ${pc.bold('Compute is currently deferred')} ${pc.dim(`(bootstrap:computeDeferred = ${deferredSince})`)}.\n` +
      '  A fresh provision sets this so VMs are not declared until images exist;\n' +
      '  it clears automatically on the next successful provisioning `pulumi up`.\n',
  );
}

// Two-level action menu: category list, then the actions inside it, with Back returning to the top.
// The two DB-exposure actions collapse into one status-aware toggle, read from the local stack config already in memory.
const backChoice = { name: '← Back', value: 'back' as const, description: 'Return to the main menu.' };

async function chooseDatabaseAction(dbExposed: boolean): Promise<Exclude<CliMode, 'status'> | 'back'> {
  const toggle = dbExposed
    ? {
        name: `Public DB access: ${pc.yellow('OPEN')}, close it`,
        value: 'unexpose-db' as const,
        description: 'Close the temporary public DB endpoint.',
      }
    : {
        name: 'Open temporary public DB access',
        value: 'expose-db' as const,
        description: 'Open a temporary DB endpoint locked to your IP (close it after).',
      };
  return select<Exclude<CliMode, 'status'> | 'back'>({
    message: 'Manage database',
    loop: false,
    choices: [
      {
        name: 'Reset database',
        value: 'reset-database',
        description: 'DESTRUCTIVE: wipe and rebuild the database empty (backup first).',
      },
      { name: 'Seed database', value: 'seed-db', description: 'Load seed data into a non-production database.' },
      toggle,
      backChoice,
    ],
  });
}

async function chooseKeysAction(): Promise<Exclude<CliMode, 'status'> | 'back'> {
  return select<Exclude<CliMode, 'status'> | 'back'>({
    message: 'Manage keys & secrets',
    loop: false,
    choices: [
      {
        name: 'Rotate keys',
        value: 'rotate',
        description: 'Replace the CI deploy key with a fresh one.',
      },
      {
        name: 'Rotate passphrase',
        value: 'rotate-passphrase',
        description: 'Re-encrypt stack state with a new Pulumi passphrase and sync it.',
      },
      {
        name: 'Manage runtime secrets',
        value: 'secrets',
        description: 'List, set, rotate, or delete the runtime secrets.',
      },
      backChoice,
    ],
  });
}

async function chooseStackAction(): Promise<Exclude<CliMode, 'status'> | 'back'> {
  return select<Exclude<CliMode, 'status'> | 'back'>({
    message: 'Stack setup',
    loop: false,
    choices: [
      {
        name: 'Apply infra change',
        value: 'apply',
        description: 'Apply database, VPC, or network changes (needs a bootstrap key).',
      },
      {
        name: 'Preview',
        value: 'preview',
        description: 'Show what a deploy would change. Read-only, makes no changes.',
      },
      {
        name: 'Resume',
        value: 'resume',
        description: 'Re-sync config and GitHub secrets, and self-heal missing keys.',
      },
      { name: 'Unlock', value: 'unlock', description: 'Clear a stale lock from an interrupted run.' },
      {
        name: 'Teardown',
        value: 'teardown',
        description: 'DESTRUCTIVE: destroy every stack resource, then optionally delete the IAM principals.',
      },
      backChoice,
    ],
  });
}

async function chooseAction(ctx: InfraContext): Promise<Exclude<CliMode, 'status'>> {
  // Exposure state lives in the gitignored overlay; the committed stack yaml is only consulted for stacks predating it.
  const overlayPath = exposureOverlayPath(ctx.environment);
  const overlayYaml = existsSync(overlayPath) ? readFileSync(overlayPath, 'utf8') : undefined;
  const dbExposed = detectDbPublicEndpoint(overlayYaml ?? ctx.stackYaml);
  const { runStatus } = await import('../tasks/status');
  while (true) {
    const category = await select<'status' | 'database' | 'keys' | 'stack'>({
      message: 'How would you like to proceed?',
      default: 'status',
      loop: false,
      choices: [
        {
          name: 'Show status',
          value: 'status',
          description: 'Health check: what is set up, what is live, and the next step.',
        },
        { name: 'Manage database', value: 'database', description: 'Reset, seed, or open temporary public access.' },
        {
          name: 'Manage keys & secrets',
          value: 'keys',
          description: 'Rotate keys or the passphrase; manage runtime secrets.',
        },
        { name: 'Stack setup', value: 'stack', description: 'Apply or preview infra changes, resume, or unlock.' },
      ],
    });
    // Status is read-only, so it runs in place and returns to the menu.
    if (category === 'status') {
      await runStatus(ctx);
      console.info('');
      continue;
    }
    const action =
      category === 'database'
        ? await chooseDatabaseAction(dbExposed)
        : category === 'keys'
          ? await chooseKeysAction()
          : await chooseStackAction();
    if (action !== 'back') return action;
  }
}

const mode: Exclude<CliMode, 'status'> =
  context.state === 'fresh' || nonInteractive() ? 'resume' : await chooseAction(context);

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

if (mode === 'teardown') {
  await runTeardown(context);
  process.exit(0);
}

await runSetup(context, mode);
