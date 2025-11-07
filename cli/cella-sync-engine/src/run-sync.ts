import pc from "picocolors";

import { boilerplateConfig, forkConfig } from "./config";

import { prepareSyncBranch } from "./modules/git/prepare-sync-branch";
import { handleMerge } from "./modules/git/handle-merge";

import { FileAnalysis } from "./types";
import { handleSquashMerge } from "./modules/git/handle-squash-merge";
import { handleRebase } from "./modules/git/handle-rebase";

export async function runSync(analyzedFiles: FileAnalysis[]) {
  console.log(pc.cyan("↻ Starting merge..."));

  await prepareSyncBranch(boilerplateConfig, forkConfig);
  await handleMerge(boilerplateConfig, forkConfig, analyzedFiles);
  await handleSquashMerge(boilerplateConfig, forkConfig);
  await handleRebase(forkConfig);
}