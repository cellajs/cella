import pc from "picocolors";

import { runSync } from "./run-sync";
import { runSetup } from "./run-setup";
import { runAnalyze } from "./run-analyze";

async function main(): Promise<void> {
  // Preflight checks
  await runSetup();

  // Analyze files
  const analyzedFiles = await runAnalyze();

  // Sync files
  await runSync(analyzedFiles);
}

main().catch((err) => {
  console.error(pc.red("❌ Error:"), err.message);
});