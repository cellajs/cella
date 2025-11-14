import pc from "picocolors";

import { runCli } from "./run-cli";
import { runSetup } from "./run-setup";
import { runSync } from "./run-sync";
import { runAnalyze } from "./run-analyze";
import { config } from "./config";
import { runPackages } from "./run-packages";

// Constants to check which services to run
const SYNC_SERVICES = ['boilerplate-fork', 'boilerplate-fork+packages'];
const PACKAGE_SERVICES = ['boilerplate-fork+packages', 'packages'];

/**
 * Main function to orchestrate the sync engine workflow.
 */
async function main(): Promise<void> {
  // Run configuration CLI
  await runCli();
  
  // Preflight checks
  await runSetup();

  // Analyze files
  const analyzedFiles = await runAnalyze();
  
  // Sync files
  if (shouldRunSync()) {
    await runSync(analyzedFiles);
  }

  // Sync package.json dependencies
  if (shouldRunPackages()) {
    await runPackages(analyzedFiles);
  }
}

/**
 * Determines if the sync process should run based on the configured sync service.
 * @returns True if sync should run, false otherwise.
 */
function shouldRunSync(): boolean {
  return SYNC_SERVICES.includes(config.syncService);
}

/**
 * Determines if the package sync process should run based on the configured sync service.
 * @returns True if package sync should run, false otherwise.
 */
function shouldRunPackages(): boolean {
  return PACKAGE_SERVICES.includes(config.syncService);
}

// Execute the main function and handle errors
main().catch((err) => {
  console.error(pc.red("x Error:"), err.message);
});