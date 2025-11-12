import pc from "picocolors";

import { runCli } from "./run-cli";
import { runSetup } from "./run-setup";
import { runSync } from "./run-sync";
import { runAnalyze } from "./run-analyze";


async function main(): Promise<void> {
  // Run configuration CLI
  await runCli();
  
  // Preflight checks
  await runSetup();

  // Analyze files
  const analyzedFiles = await runAnalyze();
  
  // Sync files
  await runSync(analyzedFiles);
}

main().catch((err) => {
  console.error(pc.red("x Error:"), err.message);
});