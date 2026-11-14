import { fetchDefaultHead, git } from './git-remote';
import { ENVIRONMENTS_FILE } from './target';

/**
 * The environments file at the head of the repository's default branch, or '' when that commit has none. The head is fetched into `dir`, an
 * empty folder, without file contents, and then only this one file's content.
 * @throws when the repository names no default branch or a git command fails.
 */
export async function readEnvironmentsFile(opts: { repository: string; key: string | undefined; dir: string }): Promise<string> {
  const head = await fetchDefaultHead(opts, ['--depth', '1', '--filter=blob:none']);
  const listed = (await git(opts.key, ['-C', opts.dir, 'ls-tree', head, ENVIRONMENTS_FILE])).trim();
  return listed ? git(opts.key, ['-C', opts.dir, 'cat-file', 'blob', `${head}:${ENVIRONMENTS_FILE}`]) : '';
}
