import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';

/**
 * Derives a docs page's `updatedAt` from git history at build time, so the value
 * never has to be hand-maintained in frontmatter and stays correct across the
 * import-wrapper pages that make up most of the docs: a thin `.mdx` shell rarely
 * changes, but the repo doc it imports (`cella/SYNC_ENGINE.md`, `cdc/README.md`, …)
 * changes constantly. The "updated" moment is therefore the most recent change
 * across the page *and* its imported bodies, not the wrapper file alone.
 *
 * Precedence, per page:
 *  1. an explicit frontmatter `updatedAt` (an author pin — always respected);
 *  2. else the newest git committer date across the page + its imported docs;
 *  3. else (untracked file, or no git history at all) the file's mtime.
 *
 * Caveats mirror the wider ecosystem (Astro/VitePress/Docusaurus all read git):
 * the value reflects the last *commit*, so a locally-edited-but-uncommitted page
 * shows its previous commit date until committed, and CI must fetch full history
 * (`fetch-depth: 0`) — a shallow clone collapses tracked files onto the mtime path.
 */

const toIso = (ms: number) => new Date(ms).toISOString();

/** The later of two ISO 8601 dates (either may be undefined). */
function laterIso(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

export type UpdatedAtResolver = {
  /**
   * Newest "updated" ISO date across `files` (a page plus its imported docs),
   * or `pinned` when the page frontmatter sets one explicitly. `undefined` only
   * when nothing resolves (no pin, no existing files).
   */
  resolve(files: string[], pinned?: string): string | undefined;
  /** Absolute git work-tree root, or null when not inside a repo (probed once). */
  readonly repoRoot: string | null;
};

/**
 * Build a resolver rooted at the git work tree containing `fromDir`. Git lookups
 * are memoized per file and invalidated on mtime change, so repeated index builds
 * (and the dev-server rebuilds) don't re-shell `git log` for unchanged files.
 */
export function createUpdatedAtResolver(fromDir: string): UpdatedAtResolver {
  const repoRoot = detectRepoRoot(fromDir);
  const cache = new Map<string, { mtimeMs: number; iso: string | undefined }>();

  const mtimeMs = (file: string): number | undefined => {
    try {
      return statSync(file).mtimeMs;
    } catch {
      return undefined; // file was moved/removed between collection and stat
    }
  };

  /** Committer date of the last commit touching `file`, or undefined (untracked / no history / no git). */
  const gitCommittedAt = (file: string, mtime: number): string | undefined => {
    const cached = cache.get(file);
    if (cached && cached.mtimeMs === mtime) return cached.iso;
    let iso: string | undefined;
    try {
      // execFile (not a shell) so paths need no quoting; `--` guards paths that look like flags.
      iso =
        execFileSync('git', ['log', '-1', '--format=%cI', '--', file], {
          cwd: repoRoot ?? undefined,
          stdio: ['ignore', 'pipe', 'ignore'],
        })
          .toString()
          .trim() || undefined;
    } catch {
      iso = undefined; // git missing, or file outside the work tree
    }
    cache.set(file, { mtimeMs: mtime, iso });
    return iso;
  };

  return {
    repoRoot,
    resolve(files, pinned) {
      if (typeof pinned === 'string' && pinned.trim()) return pinned;

      let newest: string | undefined;
      for (const file of files) {
        const mtime = mtimeMs(file);
        if (mtime === undefined) continue;
        const gitIso = repoRoot ? gitCommittedAt(file, mtime) : undefined;
        newest = laterIso(newest, gitIso ?? toIso(mtime));
      }
      return newest;
    },
  };
}

function detectRepoRoot(fromDir: string): string | null {
  try {
    return (
      execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: fromDir,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim() || null
    );
  } catch {
    return null; // not a git repo, or git unavailable
  }
}
