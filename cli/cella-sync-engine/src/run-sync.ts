import pc from "picocolors";

import { boilerplateConfig, forkConfig } from ".//config/index";

import { prepareSyncBranch } from "./modules/git/prepare-sync-branch";
import { handleBoilerplateIntoForkMerge } from "./modules/git/handle-boilerplate-into-fork-merge";

import { FileAnalysis } from "./types";
import { handleSquashMerge } from "./modules/git/handle-squash-merge";
import { handleRebase } from "./modules/git/handle-rebase";

export async function runSync(analyzedFiles: FileAnalysis[]) {
  console.log(pc.cyan("↻ Starting merge..."));

  await prepareSyncBranch(boilerplateConfig, forkConfig);
  await handleBoilerplateIntoForkMerge(boilerplateConfig, forkConfig, analyzedFiles);
  await handleSquashMerge(boilerplateConfig, forkConfig);
  await handleRebase(forkConfig);
}