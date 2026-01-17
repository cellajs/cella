import pc from 'picocolors';

import { config } from './config';
import { validateConfig } from './modules/cli/handlers';
import { runAnalyze } from './run-analyze';
import { runCli } from './run-cli';
import { runPackages } from './run-packages';
import { runSetup } from './run-setup';
import { runSync } from './run-sync';

/**
 * Orchestrates the full execution flow of the Cella Sync Engine.
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
  // Prompt configuration
  await runCli();

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
    }

    // Show final instructions for staged changes
    if (commitMessage) {
      console.info();
      console.info(pc.cyan('─'.repeat(60)));
      console.info(pc.bold('changes are staged but not committed'));
      console.info(pc.gray("run 'git commit' to finalize, or 'git reset' to abort"));
      console.info();
      console.info(pc.dim('suggested commit message:'));
      console.info(pc.white(commitMessage));
      console.info(pc.cyan('─'.repeat(60)));
    }
  }
}

// Bootstrap execution and report any unhandled errors
main().catch(() => {
  process.exit(1);
});
