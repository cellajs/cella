import * as path from 'path';
import { FileAnalysis } from "../../types";
import { RepoConfig } from '../../config';
import { createTempDir, isBinaryFile, removeDir } from '../../utils/files';
import { writeGitFileAtCommit } from '../../utils/git/files';
import { gitMergeFile } from '../../utils/git/command';

/**
 * Checks whether Git can automatically merge a specific file
 * between a fork and a boilerplate repository without conflicts.
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
): Promise<Boolean> {
  // Destructure necessary properties from the analysis object
  const { filePath, forkFile, boilerplateFile, commitSummary } = fileAnalysis;

  if (!forkFile) {
    return false;
  }

  // Skip if required data is missing
  if (!commitSummary?.sharedAncestorSha) {
    return false;
  }

  // Skip if file is binary
  if (isBinaryFile(filePath)) {
    return false;
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

    return true;
  } catch (error: any) {
    if (error.code === 1) {
      return false;
    }
    return false
  } finally {
    await removeDir(tmpDir);
  }
}