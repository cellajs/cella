import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, rm, mkdtemp } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FileSyncAnalysis } from './file-sync-analysis';
import { RepoConfig } from './config';

const exec = promisify(execFile);

/**
 * Outcome of testing if Git can auto-merge a file.
 */
export enum GitMergeCheckResult {
  AutoMergeable = "autoMergeable",
  Conflict = "conflict",
  MissingData = "missingData",
  SkippedBinary = "skippedBinary",
  Error = "error"
}

/**
 * Checks whether Git can automatically merge a specific file
 * between a fork and a boilerplate repository without conflicts.
 *
 * @param boilerplateConfig - Repo config for the boilerplate
 * @param forkConfig - Repo config for the fork
 * @param analysis - The file analysis object
 * @returns `true` if Git can auto-merge the file; `false` if a merge conflict is expected
 */
export async function canGitAutoMergeFile(
  boilerplateConfig: RepoConfig,
  forkConfig: RepoConfig,
  analysis: FileSyncAnalysis
): Promise<GitMergeCheckResult> {
  const { filePath, forkedFile, commitComparison } = analysis;

  // Skip if required data is missing
  if (!commitComparison?.sharedAncestorSha || !forkedFile) {
    return GitMergeCheckResult.MissingData;
  }

  // Skip if file is binary
  if (isBinaryFile(filePath)) {
    return GitMergeCheckResult.SkippedBinary;
  }

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'git-merge-check-'));

  const baseFile = path.join(tmpDir, 'base');
  const oursFile = path.join(tmpDir, 'ours');
  const theirsFile = path.join(tmpDir, 'theirs');

  try {
    // Write content from each commit to temporary files
    await Promise.all([
      writeGitFileAtCommit(forkConfig.repoPath, commitComparison.sharedAncestorSha, filePath, baseFile),
      writeGitFileAtCommit(forkConfig.repoPath, forkedFile.lastCommitSha, filePath, oursFile),
      writeGitFileAtCommit(boilerplateConfig.repoPath, analysis.boilerplateFile.lastCommitSha, filePath, theirsFile),
    ]);

    await exec('git', ['merge-file', '--quiet', oursFile, baseFile, theirsFile]);

    return GitMergeCheckResult.AutoMergeable;
  } catch (error: any) {
    if (error.code === 1) {
      return GitMergeCheckResult.Conflict;
    }
    return GitMergeCheckResult.Error;
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Writes the content of a file at a specific commit to a temporary file.
 *
 * @param repoPath - Absolute path to the local Git repository
 * @param commitSha - Commit SHA to read the file from
 * @param filePath - Relative path of the file in the repo
 * @param outputPath - Absolute output path to write the file to
 */
async function writeGitFileAtCommit(
  repoPath: string,
  commitSha: string,
  filePath: string,
  outputPath: string
): Promise<void> {
  const { stdout } = await exec('git', ['-C', repoPath, 'show', `${commitSha}:${filePath}`]);
  await writeFile(outputPath, stdout, 'utf8');
}

/**
 * Checks if a file is binary based on its extension.
 * This is a simple heuristic and may not cover all cases.
 *
 * @param filePath - The path of the file to check
 * @returns `true` if the file is likely binary, `false` otherwise
 */
function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.docx', '.xlsx', '.exe'].includes(ext);
}