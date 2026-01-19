import pc from 'picocolors';

import { config } from '#/config';
import { runAnalyze } from '#/modules/analyze';
import { validateConfig } from '#/modules/cli/handlers';
import { runPackages } from '#/modules/package';
import { runSync } from '#/modules/sync';
import { runCli } from '#/run-cli';
import { runSetup } from '#/run-setup';
import { gitCheckout } from '#/utils/git/command';
import { getCurrentBranch } from '#/utils/git/helpers';

/**
 * Orchestrates the full execution flow of the Cella sync CLI.
 *
 * This includes:
 *  - Running the initial CLI (config)
 *  - Validating the overrides configuration
 *  - Performing repository and configuration preflight checks
 *  - Analyzing file differences between upstream and fork
 *  - Running the repository sync (if enabled)
 *  - Running dependency sync (if enabled)
 *
 * Each step exits early on error, and errors are caught at the top level.
 *
 * @returns A Promise that resolves when the entire pipeline has executed.
 */
async function main(): Promise<void> {
  // Store original branch to restore at end
  const originalBranch = await getCurrentBranch(process.cwd());

  try {
    // Prompt configuration
    await runCli();

    // Determine target branch to restore to:
    // - If started on sync-branch: restore to forkBranchRef (working branch)
    // - Otherwise: restore to original branch
    // This ensures we never leave the user on sync-branch
    const targetBranch = originalBranch === config.forkSyncBranchRef ? config.forkBranchRef : originalBranch;

    // If only validating config, run strict validation and exit
    if (config.syncService === 'validate') {
      await validateConfig(true);
      return;
    }

    // Validate overrides config (check file patterns exist)
    await validateConfig();

    // Validate environment and repository state
    await runSetup();

    // Perform analysis (file diffs, metadata, merge strategies, etc.)
    const analyzedFiles = await runAnalyze();

    // Apply file sync logic (sync service only)
    if (config.syncService === 'sync') {
      const commitMessage = await runSync(analyzedFiles);

      // Apply package.json dependency synchronization (unless skipped)
      if (!config.skipPackages) {
        await runPackages(analyzedFiles);
        console.info();
      }

      // Show final instructions for staged changes
      if (commitMessage) {
        console.info();
        console.info(`${pc.green('✓')} changes staged, not committed`);
        console.info();
        console.info(pc.dim('suggested commit message:'));
        console.info(pc.white(commitMessage));
      }
    }
  } finally {
    // Restore to target branch (if different from current)
    // For sync service: always end on forkBranchRef so user can commit staged changes
    // For other services: restore to original branch
    const currentBranch = await getCurrentBranch(process.cwd());
    if (currentBranch !== targetBranch) {
      await gitCheckout(process.cwd(), targetBranch);
      console.info();
      console.info(`${pc.green('✓')} restored to '${targetBranch}' branch`);
    }
  }
}

// Bootstrap execution and report any unhandled errors
main().catch(() => {
  process.exit(1);
});
