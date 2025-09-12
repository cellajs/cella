import * as path from 'path';
import { MergeCheck, FileAnalysis } from "../../types";
import { RepoConfig } from '../../config';
import { createTempDir, isBinaryFile, removeDir } from '../../utils/files';
import { getFileCommitHistory, writeGitFileAtCommit } from '../../utils/git/files';
import { gitMergeFile, gitShowFileAtCommit } from '../../utils/git/command';

/**
 * Checks whether Git can automatically merge a specific file
 * between a fork and a boilerplate repository without conflicts.
 * 
 * @todo: check needs to be an indicator of how we can predict a merge resolution.
 *
 * @param boilerplateConfig - Repo config for the boilerplate
 * @param forkConfig - Repo config for the fork
 * @param analysis - The file analysis object
 * @returns `true` if Git can auto-merge the file; `false` if a merge conflict is expected
 */
export async function checkFileAutomerge(
  boilerplate: RepoConfig,
  fork: RepoConfig,
  fileAnalysis: FileAnalysis
): Promise<MergeCheck> {
  // Destructure necessary properties from the analysis object
  const { filePath, forkFile, boilerplateFile, commitSummary } = fileAnalysis;

  if (!forkFile) {
    return {
      couldRun: false,
      reason: 'missingFork',
      automergeable: false,
    };
  }

  // Skip if required data is missing
  if (!commitSummary?.sharedAncestorSha) {
    return {
      couldRun: false,
      reason: 'unrelatedHistory',
      automergeable: false,
    };
  }

  // Skip if file is binary
  if (isBinaryFile(filePath)) {
    return {
      couldRun: false,
      reason: 'binaryFile',
      automergeable: false,
    }
  }

  const tmpDir = await createTempDir('cella-merge-check-');

  // Base, ours, and theirs refer to git merge-file's semantics:
  // base: common ancestor, ours: fork version, theirs: boilerplate version
  const baseFile = path.join(tmpDir, 'base');
  const oursFile = path.join(tmpDir, 'ours');
  const theirsFile = path.join(tmpDir, 'theirs');

  try {
    // Write content from each commit to temporary files
    await Promise.all([
      writeGitFileAtCommit(fork.repoPath, commitSummary.sharedAncestorSha, filePath, baseFile),
      writeGitFileAtCommit(fork.repoPath, forkFile.lastCommitSha, filePath, oursFile),
      writeGitFileAtCommit(boilerplate.repoPath, boilerplateFile.lastCommitSha, filePath, theirsFile),
    ]);

    await gitMergeFile(oursFile, baseFile, theirsFile);

    return {
      couldRun: true,
      reason: 'none',
      automergeable: true,
    }
  } catch (error: any) {
    if (error.code === 1) {
      return {
        couldRun: true,
        reason: 'conflict',
        automergeable: false,
      }
    }
    return {
      couldRun: true,
      reason: 'unknown',
      automergeable: false,
    }
  } finally {
    await removeDir(tmpDir);
  }
}

/**
 * Check if the ancestor blob of the file is the same as the boilerplate file
 * @param analyzedFile - The file analysis object
 * @returns 
 */
export async function checkFileAncestor(
  boilerplate: RepoConfig,
  fork: RepoConfig,
  fileAnalysis: FileAnalysis
): Promise<MergeCheck> {
  const { filePath, commitSummary } = fileAnalysis;

  if (!commitSummary?.sharedAncestorSha) {
    return {
      couldRun: false,
      reason: 'unrelatedHistory',
      automergeable: false,
    };
  }

  try {
    const boilerplateBlob = await gitShowFileAtCommit(
      boilerplate.repoPath,
      commitSummary.sharedAncestorSha,
      filePath
    );
    const forkBlob = await gitShowFileAtCommit(
      fork.repoPath,
      commitSummary.sharedAncestorSha,
      filePath
    );

    const identical = boilerplateBlob === forkBlob;

    return {
      couldRun: true,
      reason: 'none',
      automergeable: identical,
    };
  } catch (err) {
    return {
      couldRun: false,
      reason: 'conflict',
      automergeable: false,
    };
  }
}

export async function checkFileHead(
  boilerplate: RepoConfig,
  fork: RepoConfig,
  fileAnalysis: FileAnalysis
): Promise<MergeCheck> {
  const { filePath, commitSummary, forkFile } = fileAnalysis;

  if (!commitSummary?.sharedAncestorSha) {
    return { 
      couldRun: false, 
      reason: 'unrelatedHistory', 
      automergeable: false,
    };
  }

  if (!forkFile) {
    return {
      couldRun: false,
      reason: 'missingFork',
      automergeable: false,
    };
  }

  try {
    // Get full commit history for the fork file (newest → oldest)
    const forkCommits = await getFileCommitHistory(fork.repoPath, fork.branch, filePath);

    // Find the index of shared ancestor in fork history
    const ancestorIndex = forkCommits.findIndex(c => c.sha === commitSummary.sharedAncestorSha);

    // If ancestor is not in fork history, we can't run safely
    if (ancestorIndex === -1) {
      return { 
        couldRun: false, 
        reason: 'unrelatedHistory', 
        automergeable: false,
      };
    }

    // Find the index of HEAD in forkCommits
    const headIndex = forkCommits.findIndex(c => c.sha === forkFile.lastCommitSha);

    // If HEAD comes *after* ancestor in history → needs merge
    if (headIndex > ancestorIndex) {
      return { 
        couldRun: true, 
        reason: 'conflict', 
        automergeable: false,
      };
    }

    // Otherwise, HEAD is at or before ancestor → merge resolved
    return { 
      couldRun: true, 
      reason: 'none', 
      automergeable: true,
    };
  } catch (err) {
    return {
      couldRun: false,
      reason: 'unknown',
      automergeable: false,
    };
  }
}