import { writeFile } from 'fs/promises';

import { gitDiffUnmerged, gitLastCommitShaForFile, gitLogFileHistory, gitLsTreeRecursive, gitLsTreeRecursiveAtCommit, gitShowFileAtCommit } from './command';
import { FileEntry, CommitEntry } from '../../types';

/**
 * Uses `git ls-tree` and `git log` to fetch blob and commit SHAs for each file.
 */
export async function getGitFileHashes(repoPath: string, branchName:string = 'HEAD'): Promise<FileEntry[]> {
  const output = await gitLsTreeRecursive(repoPath, branchName);
  const lines = output.split('\n');

  const entries: FileEntry[] = await Promise.all(
    lines.map(async (line) => {
      const [meta, filePath] = line.split('\t');
      const blobSha = meta.split(' ')[2];
      const shortBlobSha = blobSha.slice(0, 7);

      const commitShaOutput = await gitLastCommitShaForFile(repoPath, branchName, filePath);
      const shortCommitSha = commitShaOutput.slice(0, 7);

      return {
        path: filePath,
        blobSha,
        shortBlobSha,
        lastCommitSha: commitShaOutput,
        shortCommitSha,
      };
    })
  );

  return entries;
}

export async function getFileCommitHistory(repoPath: string, branchName:string, filePath: string): Promise<CommitEntry[]> {
  const output = await gitLogFileHistory(repoPath, branchName, filePath);
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, date] = line.split('|');
      return { sha, date };
    });
}

/**
 * Writes the content of a file at a specific commit to a given file path.
 */
export async function writeGitFileAtCommit(
  repoPath: string,
  commitSha: string,
  filePath: string,
  outputPath: string
): Promise<void> {
  // Use git show to get the file content at the specific commit
  const output = await gitShowFileAtCommit(repoPath, commitSha, filePath);

  // Write the content to the output file
  await writeFile(outputPath, output, 'utf8');
}

/**
 * Returns an array of filenames currently in conflict (unmerged) in the repo.
 */
export async function getUnmergedFiles(repoPath: string): Promise<string[]> {
  const output = await gitDiffUnmerged(repoPath);
  return output ? output.split('\n').filter(Boolean) : [];
}

/**
 * Get the blob SHA of a specific file at a given commit.
 *
 * @param repoPath - Path to the repo
 * @param commitSha - Commit SHA to inspect
 * @param filePath - File path to look up
 * @returns The blob SHA of the file at that commit
 */
export async function getFileBlobShaAtCommit(
  repoPath: string,
  commitSha: string,
  filePath: string
): Promise<string | null> {
  const output = await gitLsTreeRecursiveAtCommit(repoPath, commitSha);
  const lines = output.split('\n').filter(Boolean);

  for (const line of lines) {
    // format: <mode> <type> <sha>\t<path>
    const [meta, path] = line.split('\t');
    if (path === filePath) {
      const sha = meta.split(' ')[2];
      return sha;
    }
  }

  return null; // file does not exist in this commit
}