import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { select } from '@inquirer/prompts';
import { writeCompose } from '../compose/synth';
import { dbExposureConfigured } from '../lib/db-public-endpoint';
import {
  actionCommand,
  actionLabel,
  type MenuRowId,
  menuRow,
  OPERATOR_ACTIONS,
  type OperatorActionId,
  PULUMI_ACTIONS,
} from '../lib/operator-actions';
import { resolveOperatorIdentity } from '../lib/scaleway/operator-identity';
import { detectComputeDeferred, type Environment, pickStackShort } from '../lib/stack/bootstrap-stack-state';
import { environments, writeStackFileProjectId } from '../lib/stack/project-per-mode';
import { loadStackContext } from '../lib/stack/stack-context';
import { crossMark, DIVIDER, pc, printFailureHint, warningMark, withSpinner } from '../lib/utils/cli-output';
import { dropPromptOnlyEnv, loadRootEnvFile, removeModeProjectId } from '../lib/utils/env-files';
import { infraDir } from '../lib/utils/paths';
import { installedPulumiVersion, pulumiCliLagWarning, sdkPulumiVersion } from '../lib/utils/pulumi-version';
import { runAction } from './actions';
import { installPassphraseCustody } from './actions/operator-unlock';
import { parseCliArgs } from './args';
import { collectHome, formatHome, type HomeFacts, upNextOf } from './home';
import { BACK, disabledReason, formatStackLine, type MenuState, mainMenuItems, menuHotkeys, pickItems, QUIT, UP_NEXT, visibleRows } from './menu';
import { installPromptAbortHandler } from './prompts/abort';
import { ESCAPED, menuSelect } from './prompts/menu-select';
import { setPassphraseCustody } from './session';
import type { InfraContext } from './shared';
import { autoAcceptDefaults } from './shared';

// Load the repo-root .env so infra child tasks share the app's local config; ambient env keeps precedence over the file.
loadRootEnvFile();

// A privileged key or the passphrase in the environment would let the CLI run with nobody at the prompt: they are dropped here and asked for.
const droppedFromEnv = dropPromptOnlyEnv();

// A Ctrl-C at any prompt below ends the run with one line and releases a held lease.
installPromptAbortHandler();

const args = parseCliArgs(process.argv.slice(2));

/** The commands of the CLI, one line per action. */
function printHelp(): void {
  const ids = Object.keys(OPERATOR_ACTIONS) as OperatorActionId[];
  const width = Math.max(...ids.map((id) => id.length));
  console.info('Usage: pnpm infra [action] [--mode production|staging] [--once] [--defaults]\n');
  console.info('Without an action the menu opens on the home screen; an action runs alone and exits with its result.\n');
  for (const id of ids) console.info(`  ${pc.cyan(id.padEnd(width))}  ${actionLabel(id)}`);
  console.info(`\n  ${pc.dim('--once      leave after the first action chosen in the menu')}`);
  console.info(`  ${pc.dim('--defaults  take every optional default; required inputs are still asked')}`);
  console.info(`\n  ${pc.dim('Releases deploy by themselves within minutes of a merge; start-deploy deploys one now.')}`);
}

/**
 * The target mode. `--mode` or INFRA_MODE selects it explicitly, including a fresh stack with no Pulumi.<mode>.yaml yet;
 * otherwise the only existing stack file wins silently, two existing stack files ask once (under `--defaults` they need `--mode`), and with no stack
 * file an interactive install asks, defaulting to production.
 * A mode-scoped `infra/.env.<mode>` OVERRIDES the ambient env, so a staging run cannot inherit production keys from the repo-root .env.
 */
async function resolveMode(flag: string | undefined): Promise<Environment> {
  const raw = flag ?? process.env.INFRA_MODE;
  if (raw) {
    if (raw !== 'production' && raw !== 'staging') throw new Error(`INFRA_MODE must be 'production' or 'staging' (got '${raw}')`);
    return raw;
  }
  const anyStackExists = environments.some((name) => existsSync(resolve(infraDir, `Pulumi.${name}.yaml`)));
  if (!anyStackExists && !autoAcceptDefaults()) {
    return select<Environment>({
      message: 'New app. Which environment do you want to set up?',
      default: 'production',
      choices: [
        {
          name: 'production',
          value: 'production',
          description: 'Deploys every release you publish.',
        },
        {
          name: 'staging (optional)',
          value: 'staging',
          description: "A second environment, billed apart. It deploys only while infra/environments has the line 'staging branch:main'.",
        },
      ],
    });
  }
  const existing = environments.filter((name) => existsSync(resolve(infraDir, `Pulumi.${name}.yaml`)));
  if (existing.length === 2) {
    if (autoAcceptDefaults()) {
      throw new Error('Both Pulumi.production.yaml and Pulumi.staging.yaml exist: pass --mode (or set INFRA_MODE).');
    }
    return select<Environment>({ message: 'Which environment?', choices: existing.map((name) => ({ name, value: name })) });
  }
  return pickStackShort((name) => existsSync(resolve(infraDir, `Pulumi.${name}.yaml`)));
}

/**
 * Load the stack context for a mode. The menu loads it again after every action that can change the stack or this machine's keys, so the
 * next round reads the env file, the stack config and the stack state as the action left them; `log` receives the env-file notices.
 */
async function loadContext(environment: Environment, log?: (message: string) => void): Promise<InfraContext> {
  const stack = await loadStackContext(environment, log);
  // The project id scopes every Scaleway call. Only a fresh install may lack one: the setup wizard picks or creates the project and writes it to the stack file.
  if (!stack.projectId && stack.state !== 'fresh') {
    throw new Error(
      `infra/Pulumi.${environment}.yaml names no project: add this environment's project id under config, as infra:projectId, before running the infra CLI.`,
    );
  }
  // An existing stack whose project an env file still names moves it to the stack file, which every checkout has.
  if (stack.projectIdSource === 'env-file' && stack.stackYaml) {
    writeStackFileProjectId(environment, stack.projectId);
    log?.(`The project id moved to infra/Pulumi.${environment}.yaml: commit that file.`);
  }
  // A stack file that came with a pull names the project already: the env file's copy goes.
  if (stack.projectIdSource === 'stack-file') removeModeProjectId(environment);
  const context = { ...stack, hasCiKey: stack.state === 'bootstrapped' };
  // An existing stack keeps its passphrase in Secret Manager: reading it unlocks the session with the operator key, so nobody types it.
  setPassphraseCustody(undefined);
  if (context.state !== 'fresh' && context.projectId) installPassphraseCustody(context);
  return context;
}

/** What the menu needs to say which entries can run, from the home screen's reads. */
function menuState(context: InfraContext, home?: HomeFacts): MenuState {
  return {
    stackState: context.state,
    environment: context.environment,
    dbExposed: dbExposureConfigured(context.environment, context.stackYaml),
    liveEndpoints: home?.liveEndpoints,
    upNext: home ? upNextOf(home.report) : undefined,
  };
}

/** The environment line with the app's address, then the notices that hold for the whole run: key misconfigurations and deferred compute. */
function printStackNotices(context: InfraContext): void {
  const url = context.appConfig.frontendUrl ? `  ${pc.underline(context.appConfig.frontendUrl)}` : '';
  console.info(`${formatStackLine({ slug: context.appConfig.slug, environment: context.environment, state: context.state })}${url}\n`);

  // One line per key misconfiguration (a superseded name in the env file, a key the CLI no longer reads, …) before any action trips over it.
  for (const warning of [...context.envWarnings, ...resolveOperatorIdentity().warnings]) console.warn(`${warningMark} ${warning}`);

  const deferredSince = detectComputeDeferred(context.stackYaml);
  if (deferredSince) {
    console.warn(
      `${warningMark} ${pc.bold('The first setup has not finished')} ${pc.dim(`(bootstrap:computeDeferred = ${deferredSince})`)}: "${actionLabel('resume')}" continues it.\n`,
    );
  }
}

/** The home screen: one round of reads under a spinner, then the lines. Resolves to what it read, for the menu. */
async function printHome(context: InfraContext): Promise<HomeFacts | undefined> {
  if (context.state !== 'bootstrapped') return undefined;
  const home = await withSpinner(`Checking ${context.environment}`, () => collectHome(context));
  for (const line of formatHome(home)) console.info(line);
  console.info('');
  return home;
}

let pulumiLagShown = false;

/**
 * True when an action may run as far as Pulumi is concerned: one that runs no Pulumi always, one that does once the CLI is installed. A
 * laptop whose CLI trails the SDK is told once: the main job runs the SDK's version, and a newer engine may write a state an older CLI
 * refuses.
 */
function pulumiReady(action: OperatorActionId): boolean {
  if (!PULUMI_ACTIONS.includes(action)) return true;
  const installed = installedPulumiVersion();
  if (!installed) {
    printFailureHint(`"${actionLabel(action)}" runs Pulumi, which this machine does not have`, {
      command: 'brew install pulumi/tap/pulumi',
      description: 'reading (status, logs) works without it',
    });
    return false;
  }
  const lag = pulumiCliLagWarning(installed, sdkPulumiVersion());
  if (lag && !pulumiLagShown) {
    pulumiLagShown = true;
    console.warn(`${warningMark} ${lag}`);
  }
  return true;
}

/** The row the cursor starts on: the one last entered, so a second action in the same area is one keypress away. */
let lastRow: MenuRowId | typeof UP_NEXT = 'deploy';

/** Rows whose action destroys data: the cursor never rests on one, so a stray Enter after it cannot start it again. */
const DESTRUCTIVE_ROWS: readonly MenuRowId[] = ['db-reset', 'teardown'];

/** The row the cursor starts on in this state: the recommended step, else the last row, its DB access counterpart once the endpoint changed side, else the first. */
function startRow(state: MenuState): MenuRowId | typeof UP_NEXT {
  if (state.upNext) return UP_NEXT;
  const rows = visibleRows(state);
  if (lastRow === UP_NEXT || DESTRUCTIVE_ROWS.includes(lastRow)) return 'deploy';
  if (rows.includes(lastRow)) return lastRow;
  return lastRow === 'db-open' ? 'db-close' : lastRow === 'db-close' ? 'db-open' : 'deploy';
}

/**
 * The menu: one flat list of rows under group headings, each with a letter that enters it. A row with one action runs it; a row with
 * several opens a short pick, where Esc or Back returns to the list. Esc or `q` on the list leaves the CLI. A row that cannot run now
 * stays listed with the reason.
 */
async function chooseAction(state: MenuState): Promise<OperatorActionId | typeof QUIT> {
  while (true) {
    const picked = await menuSelect({
      message: 'What do you want to do?',
      items: mainMenuItems(state),
      default: startRow(state),
      escape: 'quit',
      hotkeys: menuHotkeys(state),
    });
    if (picked === ESCAPED || picked === QUIT) return QUIT;
    lastRow = picked;
    if (picked === UP_NEXT) {
      if (state.upNext) return state.upNext.action;
      continue;
    }
    const row = menuRow(picked);
    const [only] = row.actions;
    if (row.actions.length === 1 && only) return only;
    const action = await menuSelect({ message: row.label, items: pickItems(picked, state), escape: 'back' });
    if (action !== ESCAPED && action !== BACK) return action;
  }
}

if (args.help) {
  printHelp();
  process.exit(0);
}
if (args.unknownAction) {
  console.error(`${crossMark} '${args.unknownAction}' is no action of the infra CLI.\n`);
  printHelp();
  process.exit(2);
}

// The deploy reads the Compose file the service registry renders: kept current on every run, said only when it changed.
if (writeCompose() === 'written') console.info(pc.dim('infra/compose.gen.yml follows the service registry again: commit it.'));

console.info('');
const environment = await resolveMode(args.mode);
let context = await loadContext(environment, (message) => console.info(pc.dim(message)));

// Refuse an app host the load balancer cannot serve before any prompt or provisioning step.
{
  const { frontendApexIssue, routedHostIssue } = await import('../lib/naming');
  const issue = frontendApexIssue(context.appConfig) ?? routedHostIssue(context.appConfig);
  if (issue) {
    console.error(`${crossMark} ${issue}`);
    process.exit(1);
  }
}

printStackNotices(context);
if (droppedFromEnv.length > 0) {
  console.warn(
    `${warningMark} ${droppedFromEnv.join(', ')} ${droppedFromEnv.length === 1 ? 'is' : 'are'} set in this shell or in .env and not read: the CLI asks for a privileged key at the prompt and fetches the passphrase with it.\n`,
  );
}

// `pnpm infra <action>`: one action, no menu. An action the stack cannot run now says why, as its menu entry does.
if (args.action) {
  const reason = disabledReason(args.action, menuState(context));
  if (reason) {
    console.error(`${crossMark} "${actionLabel(args.action)}" cannot run now: ${reason}.`);
    process.exit(1);
  }
  if (!pulumiReady(args.action)) process.exit(1);
  process.exit(await runAction(args.action, context));
}

// A fresh install has nothing to manage yet and automation has nobody to ask: both go straight to the setup.
if (context.state === 'fresh') process.exit(await runAction('resume', context));

/** Actions that change nothing, so the menu comes back without reading the stack again. */
const READ_ONLY: readonly OperatorActionId[] = ['status', 'runs', 'preview'];

let home = await printHome(context);
while (true) {
  const action = await chooseAction(menuState(context, home));
  if (action === QUIT) break;
  const code = pulumiReady(action) ? await runAction(action, context) : 1;
  if (args.once) process.exit(code);
  console.info('');
  if (READ_ONLY.includes(action)) continue;

  // The action may have changed the stack file, the env file or the live stack: read all three again for the next round.
  console.info(pc.dim(DIVIDER));
  context = await loadContext(environment);
  printStackNotices(context);
  home = await printHome(context);
}
console.info(pc.dim(`Run an action without the menu: ${actionCommand('status')}, or \`pnpm infra help\` for the list.`));
process.exit(0);
