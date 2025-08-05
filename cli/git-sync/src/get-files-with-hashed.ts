import { exec } from "child_process";
import { promisify } from "util";
import { type RepoConfig } from "./config";

const execAsync = promisify(exec);

export type FileEntry = {
  path: string;
  blobSha: string;
  shortBlobSha: string;
  lastCommitSha: string;
  shortCommitSha: string;
};

export async function getFilesWithHashed(config: RepoConfig) {
  if (config.use === "local") {
    // Use local fetch
    return getLocalRepoFilesWithHashes(config.branch, config.filepath);
  } else {
    throw new Error("Only local repositories are supported for fetching files with hashes");
  }
}

export async function getLocalRepoFilesWithHashes(
  branch = "HEAD",
  cwd: string
): Promise<FileEntry[]> {
  const { stdout } = await execAsync(`git ls-tree -r ${branch}`, { cwd });

  const lines = stdout.trim().split("\n");

  const entries: FileEntry[] = await Promise.all(
    lines.map(async (line) => {
      const [meta, filePath] = line.split("\t");
      const blobSha = meta.split(" ")[2];
      const shortBlobSha = blobSha.slice(0, 7); // Or 10, if preferred

      const { stdout: commitSha } = await execAsync(
        `git log -n 1 --format=%H ${branch} -- "${filePath}"`,
        { cwd }
      );

      const fullCommitSha = commitSha.trim();
      const shortCommitSha = fullCommitSha.slice(0, 7); // Or use `git rev-parse --short`

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