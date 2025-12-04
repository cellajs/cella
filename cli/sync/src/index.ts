import pc from "picocolors";

import { runCli } from "./run-cli";
import { runSetup } from "./run-setup";
import { runSync } from "./run-sync";
import { runAnalyze } from "./run-analyze";
import { config } from "./config";
import { runPackages } from "./run-packages";

// Constants representing which sync modules should trigger which operations
const SYNC_MODULES = ['boilerplate-fork', 'boilerplate-fork+packages'];
const PACKAGE_MODULES = ['boilerplate-fork+packages', 'packages'];

/**
 * Orchestrates the full execution flow of the Cella Sync Engine.
 *
 * This includes:
 *  - Running the initial CLI (config)
 *  - Performing repository and configuration preflight checks
 *  - Analyzing file differences between boilerplate and fork
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
  
  // Validate environment and repository state
  await runSetup();

  // Perform analysis (file diffs, metadata, merge strategies, etc.)
  const analyzedFiles = await runAnalyze();
  
  // Apply file sync logic (if enabled)
  if (shouldRunSync()) {
    await runSync(analyzedFiles);
  }

  // Apply package.json dependency synchronization (if enabled)
  if (shouldRunPackages()) {
    await runPackages(analyzedFiles);
  }
}

/**
 * Checks whether the file sync process should be executed
 * based on the current `config.syncService` value.
 *
 * Sync is executed for:
 *  - "boilerplate-fork"
 *  - "boilerplate-fork+packages"
 *
 * @returns `true` if file sync should run, otherwise `false`.
 */
function shouldRunSync(): boolean {
  return SYNC_MODULES.includes(config.syncService);
}

/**
 * Checks whether package.json dependency synchronization should run
 * based on the configured sync module.
 *
 * Package sync is executed for:
 *  - "boilerplate-fork+packages"
 *  - "packages"
 *
 * @returns `true` if package syncing is enabled, otherwise `false`.
 */
function shouldRunPackages(): boolean {
  return PACKAGE_MODULES.includes(config.syncService);
}

// Bootstrap execution and report any unhandled errors
main().catch((err) => {
  console.error(pc.red("x Error:"), err.message);
});