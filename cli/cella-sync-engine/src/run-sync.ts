import { execSync } from 'child_process';
import { ConflictLikelihood, FileSyncAnalysis, getFileSyncAnalyses, ResolutionStrategy } from './file-sync-analysis';
import { RepoConfig } from './config';
import { existsSync } from 'node:fs'

import {
  addRemoteIfMissing,
} from './utils/git/remotes';

import {
  gitCheckout,
  gitFetch,
} from './utils/git/command';

/**
 * Entry point to run the sync process:
 * - Analyze differences
 * - Attempt merge
 * - Report files in conflict
 */
export async function runSync(boilerplateConfig: RepoConfig, forkConfig: RepoConfig, analyses: FileSyncAnalysis[]) {
  console.log('🔄 Starting boilerplate sync...');

  const forkRepoPath = forkConfig.repoPath;
  const boilerplateRepoPath = boilerplateConfig.repoPath;

  // Map analyses by file path for quick access
  const analysisMap = new Map(
    analyses.map((a) => [a.filePath, a])
  );

  await addRemoteIfMissing(forkRepoPath, 'boilerplate', boilerplateRepoPath);
  await gitFetch(forkRepoPath, 'boilerplate');
  await gitCheckout(forkConfig.repoPath, forkConfig.branch);


  // const mergeSucceeded = gitMerge(forkConfig.filePath, `boilerplate/${boilerplateConfig.branch}`);

  // if (mergeSucceeded) {
  //   console.log('✅ Merge successful. No conflicts.');
  // } else {
  //   console.log('⚠️ Merge conflict in progress. Resolution required.');
  // }

  // const isMerging = existsSync(`${forkRepoPath}/.git/MERGE_HEAD`);

  // if (isMerging) {
  //   const conflictedFiles = getConflictedFiles(forkConfig.filePath);
  //   console.log(`🧨 Found ${conflictedFiles.length} conflict(s):`);
  //   conflictedFiles.forEach(file => console.log(` - ${file}`));
  //   const unresolvedConflicts = await autoResolveConflicts(boilerplateConfig, forkConfig, conflictedFiles, analysisMap);
  //   console.log(`🔧 Attempted to auto-resolve conflicts. Unresolved: ${unresolvedConflicts}`);
  // } else {
  //   console.log('✅ No merge conflicts detected, proceeding with sync.');
  // }

  // if (hasUnresolvedConflicts(forkConfig.filePath)) {
  //   console.log('⚠️ There are still unresolved conflicts after auto-resolution. Please resolve them manually.');
  // } else {
  //   // All good, finalize the merge
  //   execSync(`git -C ${forkConfig.filePath} commit --no-verify -m "Merge boilerplate into sync-branch: resolved using ours strategy"`);
  // }


  // console.log('\n🎉 Sync complete!');
}

/**
 * Attempts a Git merge from the given source branch into the current branch.
 *
 * @param repoPath - Path to the Git repository.
 * @param sourceBranch - Fully qualified source branch (e.g., `boilerplate/development`).
 * @returns `true` if the merge completed successfully, `false` if a merge conflict is in progress.
 * @throws if the merge failed unexpectedly for reasons other than a conflict.
 */
export function gitMerge(repoPath: string, sourceBranch: string): boolean {
  try {
    execSync(`git -C ${repoPath} merge ${sourceBranch} --no-edit`, {
      stdio: 'inherit',
    });
    return true; // Merge completed successfully
  } catch (error) {
    const isMerging = existsSync(`${repoPath}/.git/MERGE_HEAD`);
    if (isMerging) {
      return false; // Merge conflict occurred
    }

    // Unexpected merge failure (e.g. corrupted repo)
    throw new Error(`❌ Merge failed unexpectedly: ${(error as Error).message}`);
  }
}

/**
 * Returns a list of file paths that are currently in a merge-conflict state.
 *
 * @param repoPath - Path to the Git repository.
 * @returns Array of file paths that have unresolved conflicts.
 */
export function getConflictedFiles(repoPath: string): string[] {
  try {
    const output = execSync(`git -C ${repoPath} diff --name-only --diff-filter=U`, {
      encoding: 'utf-8',
    });
    return output
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
  } catch (error) {
    throw new Error(`Failed to get conflicted files: ${(error as Error).message}`);
  }
}

/**
 * Resolves conflicted files using the resolution strategy defined in FileSyncAnalysis.
 * Returns true if unresolved conflicts remain.
 */
export async function autoResolveConflicts(
  boilerplateConfig: RepoConfig,
  forkConfig: RepoConfig,
  conflictedFiles: string[],
  analysisMap: Map<string, FileSyncAnalysis>
): Promise<boolean> {
  let hasUnresolvedConflicts = false;

  for (const filePath of conflictedFiles) {
    const analysis = analysisMap.get(filePath);

    if (!analysis) {
      console.warn(`⚠️ No analysis found for conflicted file: ${filePath}`);
      hasUnresolvedConflicts = true;
      continue;
    }

    const strategy = analysis.conflictAnalysis.resolutionStrategy;

    switch (strategy) {
      case ResolutionStrategy.KeepBoilerplate:
        console.log(`🔧 Resolving conflict by keeping boilerplate version for: ${filePath}`);
        // resolveConflictWithBoilerplateVersion(filePath);
        break;
      case ResolutionStrategy.KeepFork:
        console.log(`🔧 Resolving conflict by keeping fork version for: ${filePath}`);
        // resolveConflictWithForkVersion(filePath);
        break;
      case ResolutionStrategy.ManualMerge:
        console.log(`✍️ Manual merge required for: ${filePath}`);
        hasUnresolvedConflicts = true;
        break;
      default:
        console.warn(`⚠️ Unknown resolution strategy for: ${filePath}`);
        hasUnresolvedConflicts = true;
    }

    resolveConflictWithBoilerplateVersion(forkConfig.repoPath, filePath);
  }

  return hasUnresolvedConflicts;
}

/**
 * Accepts "ours" version for a conflicted file
 */
export function resolveConflictWithForkVersion(repoPath: string, filePath: string) {
  execSync(`git -C ${repoPath} checkout --ours ${filePath}`);
  execSync(`git -C ${repoPath} add ${filePath}`);
}

/**
 * Accepts "theirs" version for a conflicted file
 */
export function resolveConflictWithBoilerplateVersion(repoPath: string, filePath: string) {
  execSync(`git -C ${repoPath} checkout --theirs ${filePath}`);
  execSync(`git -C ${repoPath} add ${filePath}`);
}

export function hasUnresolvedConflicts(repoPath: string): boolean {
  const result = execSync(`git -C ${repoPath} diff --name-only --diff-filter=U`, { encoding: 'utf-8' });
  return result.trim().length > 0;
}

function squashMergeSyncBranchIntoDevelopment(repoPath: string) {
  execSync(`git -C ${repoPath} checkout development`, { stdio: 'inherit' });
  execSync(`git -C ${repoPath} merge --squash sync-branch`, { stdio: 'inherit' });
  execSync(`git -C ${repoPath} commit -m "Squash merge sync-branch into development: sync boilerplate updates"`, { stdio: 'inherit' });
}

// Add todo: Create rebase to squashMerge back from Development to sync-branch