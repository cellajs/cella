import { git, listRemoteRefs } from './git-remote';
import { ENVIRONMENTS_FILE } from './target';

/**
 * The environments file at the head of the repository's default branch, or '' when that commit has none. The head is fetched into `dir`, an
 * empty folder, without file contents, and then only this one file's content; a private repository's read key goes as a header with every
 * fetch.
 * @throws when the repository names no default branch or a git command fails.
 */
export async function readEnvironmentsFile(opts: { repository: string; key: string | undefined; dir: string }): Promise<string> {
  const head = (await listRemoteRefs(opts.repository, opts.key)(['HEAD'])).find((ref) => ref.ref === 'HEAD')?.sha;
  if (!head) throw new Error(`${opts.repository} names no default branch`);
  git(opts.key, ['init', '-q', '--bare', opts.dir]);
  git(opts.key, ['-C', opts.dir, 'remote', 'add', 'origin', opts.repository]);
  git(opts.key, ['-C', opts.dir, 'config', 'extensions.partialClone', 'origin']);
  git(opts.key, ['-C', opts.dir, 'config', 'remote.origin.promisor', 'true']);
  git(opts.key, ['-C', opts.dir, 'fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', head]);
  const listed = git(opts.key, ['-C', opts.dir, 'ls-tree', head, ENVIRONMENTS_FILE]).trim();
  return listed ? git(opts.key, ['-C', opts.dir, 'cat-file', 'blob', `${head}:${ENVIRONMENTS_FILE}`]) : '';
}
