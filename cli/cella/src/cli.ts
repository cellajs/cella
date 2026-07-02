/**
 * CLI entry point for sync CLI v2.
 *
 * Parses command line arguments and routes to appropriate service.
 */

import process from 'node:process';
import { select } from '@inquirer/prompts';
import { Command } from 'commander';
import type { AnalyzeScope, CellaCliConfig, RuntimeConfig, SyncService } from './config/types';
import pc from './utils/colors';
import { isCellaTemplate, isSyncBranch, resolveUpstream } from './utils/config';
import { NAME, printHeader, setJsonMode, VERSION } from './utils/display';
import { getCurrentBranch } from './utils/git';
import { printWarnings, validateOverrides } from './utils/overrides';

type CliServiceSelection = {
  service?: SyncService;
  options: CliOptionState;
};

type CliOptionState = Pick<
  RuntimeConfig,
  | 'logFile'
  | 'verbose'
  | 'list'
  | 'json'
  | 'diff'
  | 'openDiff'
  | 'scope'
  | 'fork'
  | 'hard'
  | 'unpinned'
  | 'track'
  | 'force'
  | 'checkOverrides'
  | 'coverage'
  | 'releasePush'
  | 'releaseAutoMerge'
>;

type MenuContext = {
  hasForks: boolean;
  /** True when running inside the cella template itself (upstream services are hidden). */
  isTemplate: boolean;
  /** True when currently on a sync branch (or an ephemeral child of it). */
  onSyncBranch: boolean;
};

type ServiceOptionDefinition = {
  flags: string;
  description: string;
};

type ServiceDefinition = {
  name: SyncService;
  description: string;
  options?: ServiceOptionDefinition[];
  includeInMenu?: (context: MenuContext) => boolean;
  menuDescription?: (context: MenuContext) => string;
};

const defaultOptions: CliOptionState = {
  logFile: false,
  verbose: false,
  list: false,
  json: false,
  diff: undefined,
  openDiff: undefined,
  scope: undefined,
  fork: undefined,
  hard: false,
  unpinned: false,
  track: undefined,
  force: false,
  checkOverrides: false,
  coverage: false,
  releasePush: true,
  releaseAutoMerge: false,
};

function readOptions(opts: Record<string, unknown>): CliOptionState {
  const scope = typeof opts.scope === 'string' ? opts.scope : undefined;
  const normalizedScope: AnalyzeScope | undefined =
    scope === 'all' || scope === 'risk' || scope === 'protected' ? scope : undefined;

  return {
    logFile: opts.log === true,
    verbose: opts.verbose === true,
    list: opts.list === true,
    json: opts.json === true,
    diff: typeof opts.diff === 'string' ? opts.diff : undefined,
    openDiff: typeof opts.openDiff === 'string' ? opts.openDiff : undefined,
    scope: normalizedScope,
    fork: typeof opts.fork === 'string' ? opts.fork : undefined,
    hard: opts.hard === true,
    unpinned: opts.unpinned === true,
    track: opts.track === 'release' || opts.track === 'branch' ? opts.track : undefined,
    force: opts.force === true,
    checkOverrides: opts.checkOverrides === true,
    coverage: opts.coverage === true,
    releasePush: opts.push !== false,
    releaseAutoMerge: opts.merge === true,
  };
}

const serviceDefinitions: ServiceDefinition[] = [
  {
    name: 'analyze',
    description: 'dry run to see what would change on sync',
    includeInMenu: (context) => !context.isTemplate,
    options: [
      { flags: '--log', description: 'write complete file list to cella-sync.log' },
      { flags: '--list', description: 'non-interactive output for tooling (one file per line)' },
      { flags: '--json', description: 'machine-readable output for tooling/agents' },
      { flags: '--scope <scope>', description: 'analyze scope for --list/--json: all|risk|protected' },
      { flags: '--track <mode>', description: 'override upstream tracking for this run: release|branch' },
      { flags: '--diff <path>', description: 'print unified diff for one file, then exit' },
      { flags: '--open-diff <path>', description: 'open VS Code side-by-side diff for one file, then exit' },
    ],
  },
  {
    name: 'sync',
    description: 'merge upstream changes into your app',
    includeInMenu: (context) => !context.isTemplate,
    options: [
      { flags: '--log', description: 'write complete file list to cella-sync.log' },
      { flags: '--hard', description: 'overwrite drifted files with upstream version (aggressive realignment)' },
      { flags: '--unpinned', description: 'ignore pinned files (except package.json) to resurface upstream changes' },
      { flags: '--track <mode>', description: 'override upstream tracking for this run: release|branch' },
    ],
    menuDescription: () => 'merge upstream changes + sync package.json',
  },
  {
    name: 'release',
    description: 'sync upstream on a fresh branch and open a squash-merge PR',
    includeInMenu: (context) => !context.isTemplate && context.onSyncBranch,
    options: [
      { flags: '--merge', description: 'auto squash-merge the PR and realign trunk (needs gh + permissions)' },
      { flags: '--no-push', description: 'leave the branch local; skip pushing and opening a PR' },
      { flags: '--track <mode>', description: 'override upstream tracking for this run: release|branch' },
    ],
    menuDescription: () => 'sync on an ephemeral branch + open a PR into main',
  },
  {
    name: 'audit',
    description: 'check for outdated packages & vulnerabilities',
    options: [
      { flags: '--list', description: 'skip interactive update prompts after printing audit results' },
      { flags: '--force', description: 'bypass pnpm metadata cache for fresh registry data' },
      { flags: '--check-overrides', description: 'check which pnpm.overrides are still needed' },
    ],
  },
  {
    name: 'forks',
    description: 'sync downstream to local fork repositories',
    options: [
      { flags: '--fork <name>', description: 'pre-select fork by name (skips fork selection prompt)' },
      { flags: '--log', description: 'write complete file list to cella-sync.log for each synced fork' },
      { flags: '-V, --verbose', description: 'show detailed output during operations' },
      { flags: '--hard', description: 'overwrite drifted files with upstream version (aggressive realignment)' },
    ],
    includeInMenu: (context) => context.hasForks,
  },
  {
    name: 'contributions',
    description: 'pull and adopt changes from forks',
    options: [
      { flags: '--fork <name>', description: 'select a specific fork directly (skips fork selection)' },
      { flags: '--list', description: 'non-interactive output (one file per line)' },
      { flags: '--json', description: 'machine-readable JSON output for tooling/agents' },
      { flags: '--diff <path>', description: 'print the unified diff for a single contributed file, then exit' },
    ],
    includeInMenu: (context) => context.hasForks,
  },
  {
    name: 'stats',
    description: 'count files by category and workspace package',
    options: [
      { flags: '-V, --verbose', description: 'show detailed output during operations' },
      { flags: '--coverage', description: 'regenerate test coverage before showing the stats summary' },
    ],
  },
];

async function getMenuContext(userConfig: CellaCliConfig, forkPath: string): Promise<MenuContext> {
  const currentBranch = await getCurrentBranch(forkPath).catch(() => '');
  return {
    hasForks: (userConfig.forks?.length ?? 0) > 0,
    isTemplate: isCellaTemplate(forkPath),
    onSyncBranch: currentBranch !== '' && isSyncBranch(currentBranch, userConfig.settings),
  };
}

/**
 * Build service menu choices, conditionally including optional services.
 */
function buildServiceChoices(context: MenuContext) {
  // Pad service labels to align descriptions (longest label is 'contributions').
  const label = (name: string) => name.padEnd(14);
  const baseChoices = serviceDefinitions
    .filter((service) => service.includeInMenu?.(context) ?? true)
    .map((service) => ({
      value: service.name,
      name: `${label(service.name)}${pc.dim(service.menuDescription?.(context) ?? service.description)}`,
    }));

  return [
    ...baseChoices,
    { type: 'separator' as const, separator: '─'.repeat(40) },
    { value: 'exit' as const, name: pc.red(`${label('exit')}${pc.dim('quit without doing anything')}`) },
  ];
}

function addServiceCommand(
  program: Command,
  definition: ServiceDefinition,
  setSelection: (selection: CliServiceSelection) => void,
) {
  const command = program.command(definition.name).description(definition.description);

  for (const option of definition.options ?? []) {
    command.option(option.flags, option.description);
  }

  command.action((opts) => {
    setSelection({
      service: definition.name,
      options: readOptions(opts),
    });
  });
}

function buildProgram(setSelection: (selection: CliServiceSelection) => void): Command {
  const program = new Command(NAME)
    .name('cella')
    .version(VERSION, '-v, --version', 'output the current version')
    .usage('[service] [options]')
    .helpOption('-h, --help', 'display help for a command')
    .showHelpAfterError()
    .addHelpText(
      'after',
      [
        '',
        'Examples:',
        '  $ cella analyze',
        '  $ cella analyze --json --scope risk',
        '  $ cella analyze --open-diff frontend/src/routes/index.tsx',
        '  $ cella sync --hard',
        '  $ cella sync --unpinned',
        '  $ cella sync --track branch',
        '  $ cella audit --check-overrides',
        '  $ cella contributions --fork raak --json',
      ].join('\n'),
    );

  for (const definition of serviceDefinitions) {
    addServiceCommand(program, definition, setSelection);
  }

  return program;
}

function parseCommandLine(argv: string[]): CliServiceSelection {
  if (argv.length <= 2) {
    return { options: { ...defaultOptions } };
  }

  let selection: CliServiceSelection = { options: { ...defaultOptions } };
  const program = buildProgram((nextSelection) => {
    selection = nextSelection;
  });

  program.parse(argv);
  return selection;
}

async function promptForService(userConfig: CellaCliConfig, forkPath: string): Promise<SyncService> {
  const selected = await select<SyncService | 'exit'>({
    message: 'choose a service:',
    choices: buildServiceChoices(await getMenuContext(userConfig, forkPath)),
    loop: false,
  });

  if (selected === 'exit') {
    console.info(pc.dim('exiting...'));
    console.info();
    process.exit(0);
  }

  console.info();
  return selected;
}

function buildRuntimeConfig(
  userConfig: CellaCliConfig,
  forkPath: string,
  selection: CliServiceSelection,
): RuntimeConfig {
  // Static fallback ref (branch tip). For release tracking the merge engine resolves
  // the concrete release-tag ref after fetching and writes it back to config.upstreamRef.
  const { branchRef } = resolveUpstream(userConfig.settings);

  return {
    ...userConfig,
    forkPath,
    upstreamRef: branchRef,
    service: selection.service ?? 'analyze',
    ...selection.options,
  };
}

/**
 * Parse CLI arguments and return configuration.
 */
export async function parseCli(userConfig: CellaCliConfig, forkPath: string): Promise<RuntimeConfig> {
  const selection = parseCommandLine(process.argv);

  // In machine-output modes (--json, --diff), reserve stdout for the payload/patch
  // and route all human output (header, warnings, spinner) to stderr.
  if (selection.options.json || selection.options.diff) setJsonMode(true);

  // Print header
  printHeader();

  // Validate config and show warnings
  const warnings = validateOverrides(userConfig, forkPath);
  if (warnings.length > 0) {
    printWarnings(warnings);
    console.info();
  }

  // If no service provided, prompt for it
  if (!selection.service) {
    selection.service = await promptForService(userConfig, forkPath);
  }

  return buildRuntimeConfig(userConfig, forkPath, selection);
}
