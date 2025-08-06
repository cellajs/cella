import { exec } from "child_process";
import { promisify } from "util";
import { type RepoConfig } from "./config";

const execAsync = promisify(exec);

/**
 * Represents a file tracked in a Git repository along with associated Git metadata.
 *
 * @property path - The relative file path in the repository.
 * @property blobSha - The full SHA-1 hash of the file's blob object.
 * @property shortBlobSha - A 7-character abbreviated blob SHA.
 * @property lastCommitSha - The full SHA of the most recent commit that modified the file.
 * @property shortCommitSha - A 7-character abbreviated version of the last commit SHA.
 */
export type FileEntry = {
  path: string;
  blobSha: string;
  shortBlobSha: string;
  lastCommitSha: string;
  shortCommitSha: string;
};

/**
 * Retrieves Git file metadata for a given repository configuration.
 *
 * Currently only supports local repositories. Returns metadata for each tracked file,
 * including blob and commit SHAs.
 *
 * @param config - Configuration object for the target Git repository.
 * @param config.use - Must be set to `"local"` to allow local repository access.
 * @param config.branch - The Git branch to inspect (default is "HEAD").
 * @param config.filePath - Path to the local Git repository root.
 *
 * @returns A promise resolving to an array of `FileEntry` objects containing Git metadata.
 *
 * @throws If the repository is not local.
 */
export async function getGitFileHashes(config: RepoConfig) {
  if (config.use === "local") {
    // Use local fetch
    return getLocalGitFileHashes(config.branch, config.filePath);
  } else {
    throw new Error("Only local repositories are supported for fetching files with hashes");
  }
}

/**
 * Retrieves a list of files and their associated Git blob and commit hashes
 * from a local Git repository.
 *
 * This includes:
 * - The SHA of each file's blob (`git ls-tree`)
 * - The SHA of the last commit affecting each file (`git log`)
 *
 * @param branch - The branch to analyze (defaults to `"HEAD"`).
 * @param cwd - The working directory (repository root) to execute Git commands from.
 *
 * @returns A promise resolving to a list of `FileEntry` objects for each tracked file.
 */
export async function getLocalGitFileHashes(
  branch = "HEAD",
  cwd: string
): Promise<FileEntry[]> {
  const { stdout } = await execAsync(`git ls-tree -r ${branch}`, { cwd });

  const lines = stdout.trim().split("\n");
  const entries: FileEntry[] = await Promise.all(
    lines.map(async (line) => {
      const [meta, filePath] = line.split("\t");
      const blobSha = meta.split(" ")[2];
      const shortBlobSha = blobSha.slice(0, 7);

      const { stdout: commitSha } = await execAsync(
        `git log -n 1 --format=%H ${branch} -- "${filePath}"`,
        { cwd }
      );

      const fullCommitSha = commitSha.trim();
      const shortCommitSha = fullCommitSha.slice(0, 7);

      return {
        path: filePath,
        blobSha,
        shortBlobSha,
        lastCommitSha: fullCommitSha,
        shortCommitSha,
      };
    })
  );

  return entries;
}