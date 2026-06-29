/**
 * Fetch lightweight metadata about the cella template from the GitHub API so the
 * scaffolder can offer "latest release" vs "latest commit" as a starting point.
 *
 * Both helpers fail soft (return null) on network/API errors or rate limits — the
 * caller falls back to the default branch when metadata is unavailable.
 */

/** Parse 'github:owner/repo' (or 'owner/repo') into [owner, repo]. */
function parseRepo(repositoryUrl: string): [string, string] {
  const [owner, repo] = repositoryUrl.replace('github:', '').split('/');
  return [owner, repo];
}

/** Format an ISO timestamp as a locale-independent YYYY-MM-DD date. */
function toDate(iso?: string): string {
  return iso ? iso.slice(0, 10) : 'unknown';
}

const GITHUB_HEADERS = { Accept: 'application/vnd.github+json' } as const;

export interface ReleaseInfo {
  /** Release tag, e.g. 'v0.5.0' */
  tag: string;
  /** Publication date, YYYY-MM-DD */
  date: string;
}

export interface CommitInfo {
  /** Full commit SHA (used for a reproducible checkout) */
  sha: string;
  /** Short 7-char SHA for display */
  shortSha: string;
  /** First line of the commit message */
  message: string;
  /** Commit date, YYYY-MM-DD */
  date: string;
}

/**
 * Fetch the latest published template release (`v*` tag).
 *
 * cella publishes two release series — the template (`v*`) and the scaffolder
 * (`create-cella-v*`). We list releases (newest first) and pick the first
 * non-draft, non-prerelease `v*` release so the scaffolder version is ignored.
 */
export async function fetchLatestRelease(repositoryUrl: string): Promise<ReleaseInfo | null> {
  const [owner, repo] = parseRepo(repositoryUrl);
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=30`;

  try {
    const response = await fetch(apiUrl, { headers: GITHUB_HEADERS });
    if (!response.ok) return null;

    const releases = (await response.json()) as Array<{
      tag_name?: string;
      published_at?: string;
      draft?: boolean;
      prerelease?: boolean;
    }>;

    const release = releases.find((r) => !r.draft && !r.prerelease && /^v\d/.test(r.tag_name ?? ''));
    if (!release?.tag_name) return null;

    return { tag: release.tag_name, date: toDate(release.published_at) };
  } catch {
    return null;
  }
}

/** Fetch the latest commit on a branch (defaults to 'main'). */
export async function fetchLatestCommit(repositoryUrl: string, branch = 'main'): Promise<CommitInfo | null> {
  const [owner, repo] = parseRepo(repositoryUrl);
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`;

  try {
    const response = await fetch(apiUrl, { headers: GITHUB_HEADERS });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      sha?: string;
      commit?: { message?: string; author?: { date?: string } };
    };
    if (!data.sha) return null;

    const message = (data.commit?.message ?? '').split('\n')[0];
    return { sha: data.sha, shortSha: data.sha.slice(0, 7), message, date: toDate(data.commit?.author?.date) };
  } catch {
    return null;
  }
}
