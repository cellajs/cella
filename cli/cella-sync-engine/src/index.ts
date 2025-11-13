import pc from "picocolors";

import { runCli } from "./run-cli";
import { runSetup } from "./run-setup";
import { runSync } from "./run-sync";
import { runAnalyze } from "./run-analyze";
import { config } from "./config";
import { runPackages } from "./run-packages";

async function main(): Promise<void> {
  // Run configuration CLI
  await runCli();
  
  // Preflight checks
  await runSetup();

  // Analyze files
  const analyzedFiles = await runAnalyze();
  
  // Sync files
  if (['boilerplate-fork', 'boilerplate-fork+packages'].includes(config.syncService)) {
    await runSync(analyzedFiles);
  }

  // Sync package.json dependencies
  if (['boilerplate-fork+packages', 'packages'].includes(config.syncService)) {
    await runPackages(analyzedFiles);
  }
}

main().catch((err) => {
  console.error(pc.red("x Error:"), err.message);
});