import { execSync } from 'child_process';
import { ConflictLikelihood, FileSyncAnalysis, getFileSyncAnalyses, ResolutionStrategy } from './file-sync-analysis';
import { RepoConfig } from './config';
import { existsSync } from 'node:fs'

/**
 * Entry point to run the sync process:
 * - Analyze differences
 * - Attempt merge
 * - Report files in conflict
 */
export async function runSync(boilerplateConfig: RepoConfig, forkConfig: RepoConfig, analyses: FileSyncAnalysis[]) {
  console.log('🔄 Starting boilerplate sync...');

  const forkRepoPath = forkConfig.filePath;
  const boilerplateRepoPath = boilerplateConfig.filePath;

  // 1. Checkout both repos and fetch latest changes
  if (!hasRemote(forkRepoPath, 'boilerplate')) {
    execSync(`git -C ${forkRepoPath} remote add boilerplate ${boilerplateRepoPath}`, { stdio: 'ignore' });
  }
  execSync(`git -C ${forkRepoPath} fetch boilerplate`);
  execSync(`git -C ${forkRepoPath} checkout ${forkConfig.branch}`);
  execSync(`git -C ${forkRepoPath} merge boilerplate/${boilerplateConfig.branch}`);

  const isMerging = existsSync(`${forkRepoPath}/.git/MERGE_HEAD`);


  if (isMerging) {
    console.log('⚠️ Merge in progress, resolving conflicts...');
  } else {
    console.log('✅ No merge conflicts detected, proceeding with sync.');
  }
  throw new Error('Sync process not implemented yet.'); // Placeholder for actual sync logic

  //   // 2. Create sync branch if not exists
  //   try {
  //     execSync(`git -C ${forkConfig.filePath} checkout -b ${forkConfig.branch}`);
  //   } catch {
  //     execSync(`git -C ${forkConfig.filePath} checkout ${forkConfig.branch}`);
  //   }

  const hasConflicts = await performMerge(analyses);

  if (hasConflicts) {
    console.log('\n❌ Merge conflicts detected — manual resolution required for:');
    for (const file of analyses) {
      if (file.conflictAnalysis.conflictLikelihood === ConflictLikelihood.High) {
        console.log(`   - ${file.filePath}`);
      }
    }
  } else {
    console.log('✅ All files merged cleanly!');
  }

  console.log('\n🎉 Sync complete!');
}

async function performMerge(analyses: FileSyncAnalysis[]): Promise<boolean> {
  let hasConflicts = false;

  for (const file of analyses) {
    const strategy = file.conflictAnalysis.resolutionStrategy;
    const path = file.filePath;

    switch (strategy) {
      case ResolutionStrategy.KeepBoilerplate:
        resolveConflictWithBoilerplateVersion(path);
        break;
      case ResolutionStrategy.KeepFork:
        resolveConflictWithForkVersion(path);
        break;
      case ResolutionStrategy.ManualMerge:
        hasConflicts = true;
        break;
      default:
        console.warn(`⚠️ Unknown resolution strategy for ${path}`);
        hasConflicts = true;
    }
  }

  return hasConflicts;
}

/**
 * Checks whether the remote with given name exists in the Git repo.
 */
function hasRemote(repoPath: string, remoteName: string): boolean {
  try {
    const remotes = execSync(`git -C ${repoPath} remote`, { encoding: 'utf-8' });
    const remoteList = remotes.split('\n').map(r => r.trim());
    return remoteList.includes(remoteName);
  } catch {
    return false;
  }
}

/**
 * Accepts "ours" version for a conflicted file
 */
export function resolveConflictWithForkVersion(filePath: string) {
  //   execSync(`git checkout --ours "${filePath}"`);
  //   execSync(`git add "${filePath}"`);
}

/**
 * Accepts "theirs" version for a conflicted file
 */
export function resolveConflictWithBoilerplateVersion(filePath: string) {
  //   execSync(`git checkout --theirs "${filePath}"`);
  //   execSync(`git add "${filePath}"`);
}