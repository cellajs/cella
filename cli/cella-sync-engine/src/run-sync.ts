import pc from "picocolors";

import { boilerplateConfig, forkConfig } from "./config";

import { prepareSyncBranch } from "./modules/git/prepare-sync-branch";
import { handleMerge } from "./modules/git/handle-merge";

import { FileAnalysis } from "./types";

export async function runSync(analyzedFiles: FileAnalysis[]) {
  console.log(pc.cyan("↻ Starting merge..."));

  await prepareSyncBranch(boilerplateConfig, forkConfig);
  await handleMerge(boilerplateConfig, forkConfig, analyzedFiles);
}