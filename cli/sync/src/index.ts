import pc from 'picocolors';

import { config, initConfig } from '#/config';
import { runAnalyze } from '#/modules/analyze';
import { validateConfig } from '#/modules/cli/handlers';
import { runPackages } from '#/modules/package';
import { runSquash } from '#/modules/squash';
import { runSync } from '#/modules/sync';
import { runValidate } from '#/modules/validate';
import { runCli } from '#/run-cli';
import { runSetup } from '#/run-setup';
import { gitCheckout } from '#/utils/git/command';
import { getCurrentBranch } from '#/utils/git/helpers';

/**
 * Orchestrates the full execution flow of the Cella sync CLI.
 *
 * Pipeline phases:
 * 0. Init - Load cella.config.ts from fork path
 * 1. CLI - Prompt for configuration
 * 2. Setup - Preflight checks, branch preparation
 * 3. Analyze - Diff upstream vs fork, determine strategies
 * 4. Sync - Merge upstream → sync-branch (resolve conflicts)
 * 5. Packages - Sync package.json dependencies (on sync-branch)
 * 6. Validate - Run pnpm install && pnpm check (on sync-branch)
 * 7. Squash - Squash sync-branch → development (after validation)
 *
 * Development branch is only touched in the final squash phase,
 * ensuring it always receives validated, working code.
 *
 * @returns A Promise that resolves when the entire pipeline has executed.
 */
async function main(): Promise<void> {
  // Initialize config from fork's cella.config.ts
  // Supports CELLA_FORK_PATH env var for testing against alternate forks
  await initConfig();

  // Store original branch to restore at end
  const originalBranch = await getCurrentBranch(process.cwd());

  // Determine target branch to restore to (initialized after config is loaded)
  let targetBranch = originalBranch;

  try {
    // Prompt configuration
    await runCli();

    // Update target branch now that config is loaded:
    // - If started on sync-branch: restore to forkBranchRef (working branch)
    // - Otherwise: restore to original branch
    // This ensures we never leave the user on sync-branch
    targetBranch = originalBranch === config.forkSyncBranchRef ? config.forkBranchRef : originalBranch;

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

    // Apply sync pipeline (sync service only)
    if (config.syncService === 'sync') {
      // Phase 4: Merge upstream → sync-branch (with conflict resolution)
      await runSync(analyzedFiles);

      // Phase 5: Sync package.json dependencies (on sync-branch)
      if (!config.skipPackages) {
        await runPackages(analyzedFiles);
        console.info();
      }

      // Phase 6: Validate (pnpm install && pnpm check) and stage all changes
      await runValidate();

      // Phase 7: Squash validated sync-branch → development
      const commitMessage = await runSquash();

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
