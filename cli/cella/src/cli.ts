/**
 * CLI entry point for sync CLI v2.
 *
 * Parses command line arguments and routes to appropriate service.
 */

import process from 'node:process';
import { select } from '@inquirer/prompts';
import { Command } from 'commander';
import type { CellaCliConfig, RuntimeConfig, SyncService } from './config/types';
import pc from './utils/colors';
import { resolveUpstream } from './utils/config';
import { NAME, printHeader, setJsonMode, VERSION } from './utils/display';
import { printWarnings, validateOverrides } from './utils/overrides';

/** Service descriptions for inquirer prompt */
const serviceDescriptions: Record<SyncService, string> = {
  analyze: 'dry run to see what would change',
  inspect: 'review drifted files, view diffs',
  sync: 'merge upstream changes',
  packages: 'sync package.json keys with upstream',
  audit: 'check for outdated packages & vulnerabilities',
  forks: 'sync downstream to local fork repositories',
  contributions: 'pull and adopt changes from forks',
  stats: 'count files by category and workspace package',
};

/**
 * Build service menu choices, conditionally including optional services.
 */
function buildServiceChoices(hasForks: boolean, syncWithPackages: boolean) {
  // Pad service labels to align descriptions (longest label is 'contributions').
  const label = (name: string) => name.padEnd(14);

  const baseChoices = [
    { value: 'analyze' as SyncService, name: `${label('analyze')}${pc.dim(serviceDescriptions.analyze)}` },
    { value: 'inspect' as SyncService, name: `${label('inspect')}${pc.dim(serviceDescriptions.inspect)}` },
    {
      value: 'sync' as SyncService,
      name: `${label('sync')}${pc.dim(syncWithPackages ? 'merge upstream changes + sync packages' : serviceDescriptions.sync)}`,
    },
  ];

  // Show packages as separate service only when syncWithPackages is disabled
  if (!syncWithPackages) {
    baseChoices.push({
      value: 'packages' as SyncService,
      name: `${label('packages')}${pc.dim(serviceDescriptions.packages)}`,
    });
  }

  baseChoices.push({ value: 'audit' as SyncService, name: `${label('audit')}${pc.dim(serviceDescriptions.audit)}` });
  baseChoices.push({ value: 'stats' as SyncService, name: `${label('stats')}${pc.dim(serviceDescriptions.stats)}` });

  // Add forks option if configured
  if (hasForks) {
    baseChoices.push({ value: 'forks' as SyncService, name: `${label('forks')}${pc.dim(serviceDescriptions.forks)}` });
    baseChoices.push({
      value: 'contributions' as SyncService,
      name: `${label('contributions')}${pc.dim(serviceDescriptions.contributions)}`,
    });
  }

  return [
    ...baseChoices,
    { type: 'separator' as const, separator: '─'.repeat(40) },
    { value: 'exit' as const, name: pc.red(`${label('exit')}${pc.dim('quit without doing anything')}`) },
  ];
}

/**
 * Parse CLI arguments and return configuration.
 */
export async function parseCli(userConfig: CellaCliConfig, forkPath: string): Promise<RuntimeConfig> {
  let service: SyncService | undefined;
  let logFile = false;
  let verbose = false;
  let list = false;
  let json = false;

  const program = new Command(NAME)
    .version(VERSION, '-v, --version', 'output the current version')
    .usage('[options]')
    .helpOption('-h, --help', 'display this help message')
    .option(
      '--service <name>',
      'service to run: analyze, inspect, sync, packages, audit, forks, contributions, stats',
      (value) => {
        if (!['analyze', 'inspect', 'sync', 'packages', 'audit', 'forks', 'contributions', 'stats'].includes(value)) {
          console.error(
            `invalid service: ${value}. must be one of: analyze, inspect, sync, packages, audit, forks, contributions, stats`,
          );
          process.exit(1);
        }
        service = value as SyncService;
      },
    )
    .option('--log', 'write complete file list to cella-sync.log', () => {
      logFile = true;
    })
    .option('--list', 'non-interactive output for inspect / contributions (one file per line)', () => {
      list = true;
    })
    .option('--json', 'machine-readable JSON output for inspect / contributions (for tooling/agents)', () => {
      json = true;
    })
    .option('--diff <path>', 'print the unified diff for a single contributed file, then exit (contributions)')
    .option('-V, --verbose', 'show detailed output during operations', () => {
      verbose = true;
    })
    .option('--fork <name>', 'pre-select fork by name (skips fork selection prompt)')
    .option('--hard', 'overwrite drifted files with upstream version (aggressive realignment)')
    .option('--force', 'bypass pnpm metadata cache for fresh registry data (audit)')
    .option('--check-overrides', 'check which pnpm.overrides are still needed (audit)')
    .option('--coverage', 'regenerate test coverage before showing the stats summary (stats)');

  program.parse(process.argv);

  // In machine-output modes (--json, --diff), reserve stdout for the payload/patch
  // and route all human output (header, warnings, spinner) to stderr.
  if (json || program.opts().diff) setJsonMode(true);

  // Print header
  printHeader();

  // Validate config and show warnings
  const warnings = validateOverrides(userConfig, forkPath);
  if (warnings.length > 0) {
    printWarnings(warnings);
    console.info();
  }

  // If no service provided, prompt for it
  const opts = program.opts();
  if (!service) {
    const hasForks = (userConfig.forks?.length ?? 0) > 0;
    const syncWithPackages = userConfig.settings.syncWithPackages !== false;
    const selected = await select<SyncService | 'exit'>({
      message: 'choose a service:',
      choices: buildServiceChoices(hasForks, syncWithPackages),
      loop: false,
    });

    if (selected === 'exit') {
      console.info(pc.dim('exiting...'));
      console.info();
      process.exit(0);
    }

    service = selected;
    console.info();
  }

  // Build runtime config
  const { upstreamRef } = resolveUpstream(userConfig.settings);

  return {
    ...userConfig,
    forkPath,
    upstreamRef,
    service: service ?? 'analyze',
    logFile,
    list,
    json,
    diff: opts.diff,
    verbose,
    fork: opts.fork,
    hard: opts.hard,
    force: opts.force,
    checkOverrides: opts.checkOverrides,
    coverage: opts.coverage,
  };
}
