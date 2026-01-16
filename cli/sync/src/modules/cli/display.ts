import pc from "picocolors";

import { DESCRIPTION, NAME, VERSION, AUTHOR, GITHUB, WEBSITE, DIVIDER } from "../../constants";
import { config } from "../../config";
import { SYNC_SERVICE_DESCRIPTIONS } from "../../config/sync-services";

/**
 * Display the welcome message for the CLI.
 */
export function showWelcome() {
  console.info();
  console.info(DIVIDER);
  console.info(pc.cyan(NAME));
  console.info();
  console.info(pc.gray(DESCRIPTION));
  console.info(`Cli version ${pc.green(VERSION)}`);
  console.info(`Created by ${AUTHOR}`);
  console.info(`${GITHUB} | ${WEBSITE}`);
  console.info(DIVIDER);
  console.info();
}

/**
 * Display the current configuration
 */
export function showConfiguration() {
  console.info(DIVIDER);
  console.info(pc.bold('About the script:'));
  console.info(`${pc.gray(SYNC_SERVICE_DESCRIPTIONS[config.syncService] || 'No description available.')}`);
  console.info();

  console.info(pc.bold('Upstream:'));
  console.info(`Location: ${pc.bold(config.upstream.location === 'local' ? '💻' : '🌐')} ${pc.cyan(config.upstream.location)}`);
  console.info(`Repository: ${pc.cyan(config.upstream.repoReference)}`);
  console.info(`Branch: <${pc.bold(pc.cyan(config.upstream.branch))}>`);
  console.info(`Remote Name: ${pc.bold('🔗')} ${pc.cyan(config.upstream.remoteName)}`);
  console.info();

  console.info(pc.bold('Fork:'));
  console.info(`Location: ${pc.bold(config.fork.location === 'local' ? '💻' : '🌐')} ${pc.cyan(config.fork.location)}`);
  console.info(`Repository: ${pc.cyan(config.fork.repoReference)}`);
  console.info(`Branch: <${pc.bold(pc.cyan(config.fork.branch))}>`);
  console.info(`Sync Branch: <${pc.bold(pc.cyan(config.fork.syncBranch))}>`);

  console.info();
  console.info(pc.bold('Script configuration:'));
  showServiceConfiguration();

  console.info(DIVIDER);
  console.info();

}

/**
 * Display the (most important) service-specific configuration.
 */
export function showServiceConfiguration() {
  console.info(`Working directory: `, pc.cyan(config.workingDirectory));
  console.info(`Writing Swizzle metadata file: `, `${config.behavior.skipWritingSwizzleMetadataFile ? pc.red('✗ No') :  pc.green('✓ Yes')}`);

  if (config.syncService === 'diverged') {
    console.info(`Include files status: `, pc.cyan(`${(config.log.analyzedFile.commitSummaryState || []).join(', ')}`));
  }

  if (config.syncService === 'upstream-fork+packages' || config.syncService === 'packages') {
    console.info(`Run GIT push: `, `${config.behavior.skipAllPushes ? pc.red('✗ No') : pc.green('✓ Yes')}`);
    console.info(`Package.json changes: `, `${pc.cyan(config.behavior.packageJsonMode === 'dryRun' ? 'Dry run (only log)' : 'Apply Changes (write, commit)')}`);
  }

  if (config.syncService === 'upstream-fork' || config.syncService === 'upstream-fork+packages') {
    console.info(`Run GIT push: `, `${config.behavior.skipAllPushes ? pc.red('✗ No') : pc.green('✓ Yes')}`);
    console.info(`Squash - max preview commits: `, pc.cyan(config.behavior.maxGitPreviewsForSquashCommits));
  }
}

/**
 * Display the starting sync message.
 */
export function showStartingSyncMessage() {
  console.info();
  console.info(DIVIDER);
  console.info(pc.bold(pc.green('✓ Done configuring the sync engine!')));
  console.info(`Starting <${config.syncService}>`);
  console.info(DIVIDER);
  console.info();
}