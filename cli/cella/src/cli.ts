/**
 * CLI entry point for sync CLI v2.
 *
 * Parses command line arguments and routes to appropriate service.
 */

import { select } from '@inquirer/prompts';
import { Command } from 'commander';
import pc from 'picocolors';
import type { CellaCliConfig, RuntimeConfig, SyncService } from './config/types';
import { NAME, printHeader, VERSION } from './utils/display';
import { printWarnings, validateOverrides } from './utils/overrides';

/** Service descriptions for inquirer prompt */
const serviceDescriptions: Record<SyncService, string> = {
  analyze: 'dry run to see what would change',
  inspect: 'review drifted files, view diffs, contribute upstream',
  sync: 'merge upstream changes',
  packages: 'sync package.json keys with upstream',
  audit: 'check for outdated packages & vulnerabilities',
  forks: 'sync downstream to local fork repositories',
  contributions: 'review and accept file contributions from forks',
};

/**
 * Build service menu choices, conditionally including optional services.
 */
function buildServiceChoices(hasForks: boolean, syncWithPackages: boolean) {
  const baseChoices = [
    { value: 'analyze' as SyncService, name: `analyze    ${pc.dim(serviceDescriptions.analyze)}` },
    { value: 'inspect' as SyncService, name: `inspect    ${pc.dim(serviceDescriptions.inspect)}` },
    {
      value: 'sync' as SyncService,
      name: `sync       ${pc.dim(syncWithPackages ? 'merge upstream changes + sync packages' : serviceDescriptions.sync)}`,
    },
  ];

  // Show packages as separate service only when syncWithPackages is disabled
  if (!syncWithPackages) {
    baseChoices.push({ value: 'packages' as SyncService, name: `packages   ${pc.dim(serviceDescriptions.packages)}` });
  }

  baseChoices.push({ value: 'audit' as SyncService, name: `audit      ${pc.dim(serviceDescriptions.audit)}` });

  // Add forks option if configured
  if (hasForks) {
    baseChoices.push({ value: 'forks' as SyncService, name: `forks      ${pc.dim(serviceDescriptions.forks)}` });
    baseChoices.push({
      value: 'contributions' as SyncService,
      name: `contrib    ${pc.dim(serviceDescriptions.contributions)}`,
    });
  }

  return [
    ...baseChoices,
    { type: 'separator' as const, separator: '─'.repeat(40) },
    { value: 'exit' as const, name: pc.red(`exit       ${pc.dim('quit without doing anything')}`) },
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

  const program = new Command(NAME)
    .version(VERSION, '-v, --version', 'output the current version')
    .usage('[options]')
    .helpOption('-h, --help', 'display this help message')
    .option(
      '--service <name>',
      'service to run: analyze, inspect, sync, packages, audit, forks, contributions',
      (value) => {
        if (!['analyze', 'inspect', 'sync', 'packages', 'audit', 'forks', 'contributions'].includes(value)) {
          console.error(
            `invalid service: ${value}. must be one of: analyze, inspect, sync, packages, audit, forks, contributions`,
          );
          process.exit(1);
        }
        service = value as SyncService;
      },
    )
    .option('--log', 'write complete file list to cella-sync.log', () => {
      logFile = true;
    })
    .option('--list', 'non-interactive output for inspect (one file per line)', () => {
      list = true;
    })
    .option('-V, --verbose', 'show detailed output during operations', () => {
      verbose = true;
    })
    .option('--fork <name>', 'pre-select fork by name (skips fork selection prompt)')
    .option('--contribute', 'push drifted files to contrib branch in upstream (non-interactive)')
    .option('--hard', 'reset drifted files to upstream version (aggressive alignment)');

  program.parse(process.argv);

  // Print header
  printHeader();

  // Validate config and show warnings
  const warnings = validateOverrides(userConfig, forkPath);
  if (warnings.length > 0) {
    printWarnings(warnings);
    console.info();
  }

  // If no service provided (and not --contribute), prompt for it
  const opts = program.opts();
  if (!service && !opts.contribute) {
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
  const remoteName = userConfig.settings.upstreamRemoteName || 'cella-upstream';
  const upstreamRef = `${remoteName}/${userConfig.settings.upstreamBranch}`;

  return {
    ...userConfig,
    forkPath,
    upstreamRef,
    service: service ?? 'analyze',
    logFile,
    list,
    verbose,
    fork: opts.fork,
    contribute: opts.contribute,
    hard: opts.hard,
  };
}
