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
  sync: 'merge upstream changes',
  packages: 'sync package.json keys with upstream',
  audit: 'check for outdated packages & vulnerabilities',
  forks: 'sync downstream to local fork repositories',
};

/**
 * Build service menu choices, conditionally including forks option.
 */
function buildServiceChoices(hasForks: boolean) {
  const baseChoices = [
    { value: 'analyze' as SyncService, name: `analyze    ${pc.dim(serviceDescriptions.analyze)}` },
    { value: 'sync' as SyncService, name: `sync       ${pc.dim(serviceDescriptions.sync)}` },
    { value: 'packages' as SyncService, name: `packages   ${pc.dim(serviceDescriptions.packages)}` },
    { value: 'audit' as SyncService, name: `audit      ${pc.dim(serviceDescriptions.audit)}` },
  ];

  // Add forks option if configured
  if (hasForks) {
    baseChoices.push({ value: 'forks' as SyncService, name: `forks      ${pc.dim(serviceDescriptions.forks)}` });
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

  const program = new Command(NAME)
    .version(VERSION, '-v, --version', 'output the current version')
    .usage('[options]')
    .helpOption('-h, --help', 'display this help message')
    .option('--service <name>', 'service to run: analyze, sync, packages, audit, forks', (value) => {
      if (!['analyze', 'sync', 'packages', 'audit', 'forks'].includes(value)) {
        console.error(`Invalid service: ${value}. Must be one of: analyze, sync, packages, audit, forks`);
        process.exit(1);
      }
      service = value as SyncService;
    })
    .option('--log', 'write complete file list to cella-sync.log', () => {
      logFile = true;
    })
    .option('-V, --verbose', 'show detailed output during operations', () => {
      verbose = true;
    });

  program.parse(process.argv);

  // Print header
  printHeader();

  // Validate config and show warnings
  const warnings = validateOverrides(userConfig, forkPath);
  if (warnings.length > 0) {
    printWarnings(warnings);
    console.info();
  }

  // If no service provided, prompt for it
  if (!service) {
    const hasForks = (userConfig.forks?.length ?? 0) > 0;
    const selected = await select<SyncService | 'exit'>({
      message: 'choose a service:',
      choices: buildServiceChoices(hasForks),
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
    service,
    logFile,
    verbose,
  };
}
