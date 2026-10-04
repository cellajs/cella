import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { select } from '@inquirer/prompts';
import { dbExposureConfigured } from '../lib/db-public-endpoint';
import { actionCommand, actionLabel, type MenuRowId, menuRow, OPERATOR_ACTIONS, type OperatorActionId } from '../lib/operator-actions';
import { resolveOperatorIdentity } from '../lib/scaleway/operator-identity';
import { detectComputeDeferred, type Environment, pickStackShort } from '../lib/stack/bootstrap-stack-state';
import { loadStackContext } from '../lib/stack/stack-context';
import { crossMark, DIVIDER, failWithHint, pc, printHeader, warningMark, withSpinner } from '../lib/utils/cli-output';
import { loadBaseEnvFiles } from '../lib/utils/env-files';
import { infraDir } from '../lib/utils/paths';
import { installedPulumiVersion, pulumiCliLagWarning, sdkPulumiVersion } from '../lib/utils/pulumi-version';
import { runAction } from './actions';
import { liveDbEndpoints } from './actions/db-exposure';
import { parseCliArgs } from './args';
import { BACK, disabledReason, formatAccessLines, formatStackLine, type MenuState, mainMenuItems, pickItems, QUIT, visibleRows } from './menu';
import { installPromptAbortHandler } from './prompts/abort';
import { ESCAPED, menuSelect } from './prompts/menu-select';
import type { InfraContext } from './shared';
import { autoAcceptDefaults, nonInteractive } from './shared';

// Load backend/.env before the root fallback so infra child tasks share the app's local config; ambient env keeps precedence over both files.
loadBaseEnvFiles();

// A Ctrl-C at any prompt below ends the run with one line and releases a held stack lock.
installPromptAbortHandler();

const args = parseCliArgs(process.argv.slice(2));

/** The commands of the CLI, one line per action. */
function printHelp(): void {
  const ids = Object.keys(OPERATOR_ACTIONS) as OperatorActionId[];
  const width = Math.max(...ids.map((id) => id.length));
  console.info('Usage: pnpm infra [action] [--mode production|staging] [--once] [--defaults]\n');
  console.info('Without an action the menu opens; an action runs alone and exits with its result.\n');
  for (const id of ids) console.info(`  ${pc.cyan(id.padEnd(width))}  ${actionLabel(id)}`);
  console.info(`\n  ${pc.dim('--once      leave after the first action chosen in the menu')}`);
  console.info(`  ${pc.dim('--defaults  take every optional default; required inputs are still asked')}`);
  console.info(`\n  ${pc.dim('A release is deployed by its own command: pnpm --filter infra run deploy --mode <mode> --sha <sha> [--build]')}`);
}

/**
 * The target mode. `--mode` or INFRA_MODE selects it explicitly, including a fresh stack with no Pulumi.<mode>.yaml yet;
 * otherwise the only existing stack file wins silently, two existing stack files ask once (and fail non-interactively), and with no stack
 * file an interactive install asks, defaulting to staging.
 * A mode-scoped `infra/.env.<mode>` OVERRIDES the ambient env, so a staging run cannot inherit production keys from backend/.env.
 */
async function resolveMode(flag: string | undefined): Promise<Environment> {
  const raw = flag ?? process.env.INFRA_MODE;
  if (raw) {
    if (raw !== 'production' && raw !== 'staging') throw new Error(`INFRA_MODE must be 'production' or 'staging' (got '${raw}')`);
    return raw;
  }
  const anyStackExists = (['production', 'staging'] as const).some((name) => existsSync(resolve(infraDir, `Pulumi.${name}.yaml`)));
  if (!anyStackExists && !autoAcceptDefaults()) {
    return select<Environment>({
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
    return select<Environment>({ message: 'Which stack?', choices: existing.map((name) => ({ name, value: name })) });
  }
  return pickStackShort((name) => existsSync(resolve(infraDir, `Pulumi.${name}.yaml`)));
}

/**
 * Load the stack context for a mode. The menu loads it again after every action that can change the stack or this machine's keys, so the
 * next round reads the env file, the stack config and the stack state as the action left them; `log` receives the env-file notices.
 */
async function loadContext(environment: Environment, log?: (message: string) => void): Promise<InfraContext> {
  const stack = await loadStackContext(environment, log);
  // The project id scopes every Scaleway call. Only a fresh install may lack one: the setup wizard picks or creates the project and writes SCW_PROJECT_ID to backend/.env.
  if (!stack.projectId && stack.state !== 'fresh') {
    throw new Error('SCW_PROJECT_ID is not set: add it to backend/.env before running the infra CLI.');
  }
  return { ...stack, hasCiKey: stack.state === 'bootstrapped' };
}

/** What the menu needs to say which entries can run. `liveEndpoints` comes from the header's read of the database instance. */
function menuState(context: InfraContext, liveEndpoints?: string[]): MenuState {
  return {
    stackState: context.state,
    environment: context.environment,
    encrypted: !!context.stackYaml && /^encryptionsalt:/m.test(context.stackYaml),
    hasAdminKey: !!resolveOperatorIdentity().admin,
    dbExposed: dbExposureConfigured(context.environment, context.stackYaml),
    liveEndpoints,
  };
}

/** The stack line, then the notices that hold for the whole run: key misconfigurations and deferred compute. Printed once. */
function printStackNotices(context: InfraContext): void {
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
}

/**
 * What an operator wants to know before choosing: is the stack locked, what is live, which keys this machine holds, and whether the
 * database has a public endpoint. One bounded, best-effort read; resolves to the live DB endpoints for the menu's DB access row.
 */
async function printStackFacts(context: InfraContext): Promise<string[] | undefined> {
  const identity = resolveOperatorIdentity();
  let liveEndpoints: string[] | undefined;
  if (context.state === 'bootstrapped') {
    const { collectQuickFacts, formatQuickFacts } = await import('../tasks/status');
    const [facts, endpoints] = await withSpinner('Reading the lock, the live release, the key and the database endpoint', () =>
      Promise.all([
        collectQuickFacts({ environment: context.environment, appConfig: context.appConfig, projectId: context.projectId || undefined }),
        liveDbEndpoints(context),
      ]),
    );
    liveEndpoints = endpoints;
    const configured = identity.admin ? 'admin' : identity.ambient ? 'ambient' : 'none';
    for (const line of formatQuickFacts(facts, { configured })) console.info(line);
  }
  const access = formatAccessLines({
    ownerKeySource: identity.owner?.source,
    stackState: context.state,
    dbExposed: dbExposureConfigured(context.environment, context.stackYaml),
    liveEndpoints,
  });
  for (const line of access) console.info(line);
  console.info('');
  return liveEndpoints;
}

/** The row the cursor starts on: the one last entered, so a second action in the same area is one keypress away. */
let lastRow: MenuRowId = 'status';

/** Rows whose action destroys data: the cursor never rests on one, so a stray Enter after it cannot start it again. */
const DESTRUCTIVE_ROWS: readonly MenuRowId[] = ['db-reset', 'teardown'];

/** The row the cursor starts on in this state: the last one, its DB access counterpart once the endpoint changed side, else the first. */
function startRow(state: MenuState): MenuRowId {
  const rows = visibleRows(state);
  if (DESTRUCTIVE_ROWS.includes(lastRow)) return 'status';
  if (rows.includes(lastRow)) return lastRow;
  return lastRow === 'db-open' ? 'db-close' : lastRow === 'db-close' ? 'db-open' : 'status';
}

/**
 * The menu: one flat list of rows under group headings. A row with one action runs it; a row with several opens a short pick, where Esc or
 * Back returns to the list. Esc or `q` on the list leaves the CLI. A row that cannot run now stays listed with the reason.
 */
async function chooseAction(state: MenuState): Promise<OperatorActionId | typeof QUIT> {
  while (true) {
    const picked = await menuSelect({ message: 'What do you want to do?', items: mainMenuItems(state), default: startRow(state), escape: 'quit' });
    if (picked === ESCAPED || picked === QUIT) return QUIT;
    lastRow = picked;
    const row = menuRow(picked);
    const [only] = row.actions;
    if (row.actions.length === 1 && only) return only;
    const action = await menuSelect({ message: row.label, items: pickItems(picked, state), escape: 'back' });
    if (action !== ESCAPED && action !== BACK) return action;
  }
}

printHeader('infra cli');

if (args.help) {
  printHelp();
  process.exit(0);
}
if (args.unknownAction) {
  console.error(`${crossMark} '${args.unknownAction}' is no action of the infra CLI.\n`);
  printHelp();
  process.exit(2);
}

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

const environment = await resolveMode(args.mode);
let context = await loadContext(environment, (message) => console.info(pc.dim(message)));

// Fail on an apex-hosted frontend before any prompt or provisioning step; the LB module cannot serve the app at the zone apex, and `pulumi up` only throws once half a deploy has run.
{
  const { frontendApexIssue } = await import('../lib/naming');
  const apexIssue = frontendApexIssue(context.appConfig);
  if (apexIssue) {
    console.error(`${crossMark} ${apexIssue}`);
    process.exit(1);
  }
}

printStackNotices(context);

// `pnpm infra <action>`: one action, no menu. An action the stack cannot run now says why, as its menu entry does.
if (args.action) {
  const reason = disabledReason(args.action, menuState(context));
  if (reason) {
    console.error(`${crossMark} "${actionLabel(args.action)}" cannot run now: ${reason}.`);
    process.exit(1);
  }
  process.exit(await runAction(args.action, context));
}

// A fresh install has nothing to manage yet and automation has nobody to ask: both go straight to the setup.
if (context.state === 'fresh' || nonInteractive()) process.exit(await runAction('resume', context));

/** Actions that change nothing, so the menu comes back without reading the stack again. */
const READ_ONLY: readonly OperatorActionId[] = ['status', 'preview'];

let liveEndpoints = await printStackFacts(context);
while (true) {
  const action = await chooseAction(menuState(context, liveEndpoints));
  if (action === QUIT) break;
  const code = await runAction(action, context);
  if (args.once) process.exit(code);
  console.info('');
  if (READ_ONLY.includes(action)) continue;

  // The action may have changed the stack file, the env file or the live stack: read all three again for the next round.
  console.info(pc.dim(DIVIDER));
  context = await loadContext(environment);
  console.info(`${formatStackLine({ slug: context.appConfig.slug, environment: context.environment, state: context.state })}\n`);
  liveEndpoints = await printStackFacts(context);
}
console.info(pc.dim(`Run an action without the menu: ${actionCommand('status')}, or \`pnpm infra help\` for the list.`));
process.exit(0);
