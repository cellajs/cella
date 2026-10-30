import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { lineColumn, repoFiles, repoRoot } from '../../../../shared/scripts/repo-files.ts';
import { parseSource } from '../../../../shared/scripts/source-comments.ts';
import { classTexts, classTokens, isClassSource, loadTailwindNode } from '../../../../shared/scripts/tailwind-class-rules.ts';

export { repoRoot };

const git = (args, input) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', input, maxBuffer: 1e9 });
const read = (file) => readFileSync(join(repoRoot, file), 'utf8');
const isStory = (file) => /\.stories\.tsx?$/.test(file);
const manifestPath = 'cella/cella.manifest.json';

const stylesheets = () => repoFiles().filter((file) => /^frontend\/src\/.*\.css$/.test(file));

/** Prints which checkout a tool reads, so a report on the wrong repo shows on its first line. */
export function printHeader() {
  const app = repoFiles().includes(manifestPath);
  console.info(`repo: ${repoRoot} (${app ? 'app' : 'template'})`);
}

/** Frontend scripts holding class strings, tests excluded; stories only on request, since a story can make a dead class look alive. */
export function classSources({ stories = false } = {}) {
  return repoFiles().filter((file) => isClassSource(file) && (stories || !isStory(file)));
}

/** Every string in a class position, as `{ file, line, tokens }`; a token touching a `${...}` placeholder is dropped. */
export function classStrings(options) {
  const rows = [];
  for (const file of classSources(options)) {
    const source = read(file);
    for (const text of classTexts(parseSource(file, source))) {
      const tokens = classTokens(text).map(({ token }) => token);
      if (tokens.length) rows.push({ file, line: lineColumn(source, text.start).line, tokens });
    }
  }
  return rows;
}

/**
 * A new design system each call. `canonicalizeCandidates` leaves entries in its instance's compile cache that resolve theme
 * variables differently, so a check that rewrites and compiles on one instance passes wrong rewrites.
 */
export async function freshDesignSystem() {
  const entry = stylesheets().find((file) => /@import\s+['"]tailwindcss['"]/.test(read(file)));
  if (!entry) throw new Error('no frontend stylesheet imports tailwindcss');
  return loadTailwindNode().__unstable__loadDesignSystem(read(entry), { base: dirname(join(repoRoot, entry)) });
}

/** Names of the frontend's own `@utility` (a functional `x-*` without its `-*`) and `@custom-variant` declarations. */
export function declaredNames() {
  const css = stylesheets().map(read).join('\n');
  const names = (at) => new Set([...css.matchAll(new RegExp(`@${at}\\s+([\\w-]+)`, 'g'))].map((match) => match[1]));
  return { utilities: names('utility'), variants: names('custom-variant') };
}

const overrideList = (config, name) =>
  [...(config.split(new RegExp(`${name}:\\s*\\[`))[1] ?? '').split(']')[0].matchAll(/'([^']+)'/g)].map((match) => match[1]);
const isUnder = (file, entry) => file === entry || file.startsWith(`${entry}/`);

/**
 * What a finding in each frontend file means, by the file's relation to the template (SKILL.md, In an app): `template` when
 * this repo is the template; in an app `app` (owned, upgrades never reach it), `drifted` (differs from the upgrade baseline)
 * or `identical` (equals the baseline, so the template owns the fix).
 */
export function fileScope() {
  const files = repoFiles().filter((file) => file.startsWith('frontend/src/'));
  if (!repoFiles().includes(manifestPath)) return new Map(files.map((file) => [file, 'template']));

  const { commit } = JSON.parse(read(manifestPath)).upstream;
  try {
    git(['cat-file', '-e', `${commit}^{commit}`]);
  } catch {
    throw new Error(`upgrade baseline ${commit} is not in this clone: fetch the template's remote first`);
  }
  const baseline = new Map(
    git(['ls-tree', '-r', commit, 'frontend/src'])
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [, blob, path] = /^\d+ blob (\w+)\t(.*)$/.exec(line);
        return [path, blob];
      }),
  );
  const hashes = git(['hash-object', '--no-filters', '--stdin-paths'], files.join('\n')).trim().split('\n');
  const config = read('cella/cella.config.ts');
  const owned = [...overrideList(config, 'ignored'), ...overrideList(config, 'pinned')];
  const appModules = files.filter((file) => /-module\.tsx?$/.test(file) && /owner:\s*'app'/.test(read(file))).map((file) => dirname(file));
  return new Map(
    files.map((file, index) => {
      if (!baseline.has(file) || [...owned, ...appModules].some((entry) => isUnder(file, entry))) return [file, 'app'];
      return [file, baseline.get(file) === hashes[index] ? 'identical' : 'drifted'];
    }),
  );
}
