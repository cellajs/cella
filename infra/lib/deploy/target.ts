/**
 * What an environment deploys (D8): by default the newest commit of the branch it follows, or the newest release; one optional line in the
 * repository's environments file pins a release or a commit, raises the retry counter, or adds an environment. An environment that follows
 * the releases deploys releases only: its line names `releases` or a release tag. The runner reads this, as data, once a minute.
 */

/** Where the environments file lives in the repository, relative to its root. */
export const ENVIRONMENTS_FILE = 'infra/environments';

/** How an environment's target is found. */
export type TargetRule = { kind: 'branch'; branch: string } | { kind: 'releases' } | { kind: 'pin'; ref: string };

/** One environment's line: its rule, and the retry counter a person raises to have the same target deployed again. */
export interface EnvironmentLine {
  environment: string;
  rule: TargetRule;
  retry: number;
}

/** A ref as `git ls-remote` lists it. Annotated tags come twice: the tag object, and `^{}` with the commit it points to. */
export interface RemoteRef {
  sha: string;
  ref: string;
}

/** The environment's target: a commit, the retry counter, and how it was found (for the record and the log). */
export interface Target {
  environment: string;
  sha: string;
  retry: number;
  source: string;
}

const COMMIT = /^[0-9a-f]{40}$/;
const RELEASE_TAG = /^\d+\.\d+\.\d+$/;

function parseRule(word: string): TargetRule {
  if (word === 'releases') return { kind: 'releases' };
  if (word.startsWith('branch:') && word.length > 'branch:'.length) return { kind: 'branch', branch: word.slice('branch:'.length) };
  if (COMMIT.test(word) || RELEASE_TAG.test(word)) return { kind: 'pin', ref: word };
  throw new Error(`'${word}' is no target: write branch:<name>, releases, a release tag such as 0.18.1, or a full commit id`);
}

/**
 * Read the environments file: `<environment> <target> [retry <n>]` per line, `#` to the end of a line is a comment. A file that names an
 * environment twice, or writes a target or a counter it cannot read, is refused whole: a deploy must never guess.
 */
export function parseEnvironmentsFile(text: string): Map<string, EnvironmentLine> {
  const lines = new Map<string, EnvironmentLine>();
  text.split('\n').forEach((raw, index) => {
    const words = (raw.split('#')[0] ?? '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return;
    const where = `${ENVIRONMENTS_FILE}:${index + 1}`;
    const [environment, target, keyword, count, ...rest] = words;
    if (!environment || !target || rest.length > 0 || (keyword !== undefined && (keyword !== 'retry' || count === undefined))) {
      throw new Error(`${where}: expected '<environment> <target> [retry <n>]', got '${raw.trim()}'`);
    }
    if (!/^[a-z][a-z0-9-]*$/.test(environment)) throw new Error(`${where}: '${environment}' is no environment name`);
    if (lines.has(environment)) throw new Error(`${where}: ${environment} has a line already`);
    const retry = count === undefined ? 0 : Number(count);
    if (!Number.isInteger(retry) || retry < 0) throw new Error(`${where}: the retry counter must be a whole number, got '${count}'`);
    let rule: TargetRule;
    try {
      rule = parseRule(target);
    } catch (error) {
      throw new Error(`${where}: ${error instanceof Error ? error.message : String(error)}`);
    }
    // Merging a line is not publishing a release: an environment that follows the releases takes no commit and no branch from a line.
    if (defaultRule(environment).kind === 'releases' && (rule.kind === 'branch' || (rule.kind === 'pin' && !RELEASE_TAG.test(rule.ref)))) {
      throw new Error(`${where}: ${environment} deploys releases only: write releases or a release tag such as 0.18.1, got '${target}'`);
    }
    lines.set(environment, { environment, rule, retry });
  });
  return lines;
}

/** The rule of an environment without a line: production follows the releases, every other environment the main branch. */
export function defaultRule(environment: string): TargetRule {
  return environment === 'production' ? { kind: 'releases' } : { kind: 'branch', branch: 'main' };
}

const semverParts = (tag: string) => tag.split('.').map(Number) as [number, number, number];
const newer = (a: string, b: string) => {
  const [x, y] = [semverParts(a), semverParts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

/** The commit a tag points to: the `^{}` line of an annotated tag, else the tag's own line. */
function tagCommit(refs: readonly RemoteRef[], tag: string): string | undefined {
  return refs.find((ref) => ref.ref === `refs/tags/${tag}^{}`)?.sha ?? refs.find((ref) => ref.ref === `refs/tags/${tag}`)?.sha;
}

/** Find an environment's target from its line, or its default, and the repository's refs. */
export async function resolveTarget(opts: {
  environment: string;
  line?: EnvironmentLine;
  listRemote: (patterns: string[]) => Promise<RemoteRef[]>;
}): Promise<Target> {
  const retry = opts.line?.retry ?? 0;
  const of = (sha: string, source: string): Target => ({ environment: opts.environment, sha, retry, source });
  const rule = opts.line?.rule ?? defaultRule(opts.environment);
  if (rule.kind === 'branch') {
    const head = (await opts.listRemote([`refs/heads/${rule.branch}`])).find((ref) => ref.ref === `refs/heads/${rule.branch}`);
    if (!head) throw new Error(`${opts.environment} follows branch ${rule.branch}, which the repository does not have`);
    return of(head.sha, `branch ${rule.branch}`);
  }
  if (rule.kind === 'releases') {
    const refs = await opts.listRemote(['refs/tags/*']);
    const tags = refs.map((ref) => ref.ref.replace(/^refs\/tags\//, '').replace(/\^\{\}$/, '')).filter((tag) => RELEASE_TAG.test(tag));
    const newest = tags.reduce<string | undefined>((best, tag) => (best === undefined || newer(tag, best) ? tag : best), undefined);
    const sha = newest ? tagCommit(refs, newest) : undefined;
    if (!newest || !sha) throw new Error(`${opts.environment} follows the releases, and the repository has none`);
    return of(sha, `release ${newest}`);
  }
  if (COMMIT.test(rule.ref)) return of(rule.ref, `pinned commit ${rule.ref.slice(0, 10)}`);
  const sha = tagCommit(await opts.listRemote([`refs/tags/${rule.ref}`, `refs/tags/${rule.ref}^{}`]), rule.ref);
  if (!sha) throw new Error(`${opts.environment} is pinned to release ${rule.ref}, which the repository does not have`);
  return of(sha, `pinned release ${rule.ref}`);
}

/** Parse `git ls-remote` output: `<sha>\t<ref>` per line. */
export function parseLsRemote(output: string): RemoteRef[] {
  return output
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter((parts): parts is [string, string] => parts.length === 2 && COMMIT.test(parts[0] ?? ''))
    .map(([sha, ref]) => ({ sha, ref }));
}
