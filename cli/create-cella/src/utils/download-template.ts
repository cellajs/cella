import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseTarGzip } from 'nanotar';

/** Parse `github:owner/repo` or `owner/repo` into its owner and repo parts. */
function parseGithubRepo(template: string): { owner: string; repo: string } {
  const [owner, repo] = template.replace(/^github:/, '').split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid template '${template}'. Expected 'github:owner/repo'.`);
  }
  return { owner, repo };
}

/**
 * Downloads a GitHub repository tarball and extracts it into `targetFolder`.
 *
 * Uses the codeload `tar.gz` endpoint with a plain `fetch` and pure-JS gunzip +
 * untar (nanotar, via the Web `DecompressionStream`). No git, no `child_process`,
 * so `create-cella` keeps a clean supply-chain profile (no shell access).
 *
 * @param template - `github:owner/repo` (or `owner/repo`).
 * @param ref - Release tag, commit SHA, or branch to download.
 * @param targetFolder - Directory to extract the template into.
 */
export async function downloadGithubTemplate(template: string, ref: string, targetFolder: string): Promise<void> {
  const { owner, repo } = parseGithubRepo(template);
  const url = `https://codeload.github.com/${owner}/${repo}/tar.gz/${ref}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download template ${owner}/${repo}@${ref}: ${response.status} ${response.statusText}`);
  }

  const archive = new Uint8Array(await response.arrayBuffer());
  const entries = await parseTarGzip(archive);

  for (const entry of entries) {
    if (entry.type !== 'file' || !entry.data) continue;
    // GitHub nests everything under a top-level `repo-ref/` folder — strip it.
    const relativePath = entry.name.replace(/^[^/]+\//, '');
    if (!relativePath) continue;

    const dest = join(targetFolder, relativePath);
    await mkdir(dirname(dest), { recursive: true });
    // Preserve the executable bit (nanotar reports mode as an octal string).
    const mode = entry.attrs?.mode ? Number.parseInt(entry.attrs.mode, 8) : undefined;
    await writeFile(dest, entry.data, mode ? { mode } : undefined);
  }
}
