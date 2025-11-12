import pc from "picocolors";

import { runCli } from "./run-cli";
import { runSetup } from "./run-setup";
import { runSync } from "./run-sync";
import { runAnalyze } from "./run-analyze";
import { config } from "./config";


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
}

main().catch((err) => {
  console.error(pc.red("x Error:"), err.message);
});