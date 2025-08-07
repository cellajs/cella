import { gitLastCommitShaForFile, gitLogFileHistory, gitLsTreeRecursive } from './command';
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