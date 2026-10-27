import { type Finding, isUnder } from './repo-files.ts';

/** An alignment folder name: `<YYYYMMDDThhmm>-<slug>`, UTC minute precision. */
const alignmentIdPattern = /^\d{8}T\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

const alignmentsDir = 'cella/alignments/';

/** How an app finds the code an alignment leaves behind: typecheck, a test it inherits, or only by reading. */
const caughtByValues = ['compiler', 'tests', 'nothing'];

/** What checking one alignment README finds: the codemod's default scan roots it names and every shape problem. */
interface ReadmeCheck {
  roots: string[];
  errors: string[];
}

const requiredBooleanKeys = ['syncBreaking', 'clientCacheBump'];
const booleanKeys = [...requiredBooleanKeys, 'generate'];
/** Comma-separated values: the terms `pnpm cella align` greps for, and the codemod's roots. */
const listKeys = ['grep', 'roots'];

/** The lines after the frontmatter, without HTML comment lines (a comment opens at the start of a line). */
function bodyLines(lines: string[]): string[] {
  let inComment = false;
  return lines.filter((line) => {
    if (!inComment && !line.trimStart().startsWith('<!--')) return true;
    inComment = !line.includes('-->');
    return false;
  });
}

/** Checks an alignment README: its frontmatter, title and summary paragraph, and the `roots` it names. */
export function checkAlignmentReadme(source: string): ReadmeCheck {
  const errors: string[] = [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');

  const close = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  if (close === -1) errors.push('must open with a `---` frontmatter block');
  const frontmatter = new Map<string, string>();
  for (const line of lines.slice(1, Math.max(close, 1))) {
    const match = /^(\w+):\s*(.*)$/.exec(line);
    if (!match) {
      errors.push(`frontmatter line is not \`key: value\`: ${line}`);
      continue;
    }
    const [, key, value] = match;
    frontmatter.set(key, value);
    if (booleanKeys.includes(key)) {
      if (value !== 'true' && value !== 'false') errors.push(`${key} must be true or false`);
    } else if (key === 'caughtBy') {
      if (!caughtByValues.includes(value)) errors.push(`caughtBy must be one of ${caughtByValues.join(', ')}`);
    } else if (!listKeys.includes(key)) errors.push(`unknown frontmatter key: ${key}`);
  }
  for (const key of requiredBooleanKeys) if (close !== -1 && !frontmatter.has(key)) errors.push(`frontmatter is missing ${key}`);
  if (frontmatter.get('syncBreaking') === 'true' && !frontmatter.has('caughtBy'))
    errors.push('a sync-breaking alignment says how an app finds its leftovers: caughtBy');

  // Body: the title, then the summary paragraph. Blank lines and HTML comments in between are skipped.
  const body = bodyLines(lines.slice(close + 1)).join('\n');
  const blocks = body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (!/^# .+$/.test(blocks[0] ?? '')) errors.push('the first line after the frontmatter must be the `# ` title');
  const summary = blocks[1] ?? '';
  if (!summary || /^(#|>|[-*|]|```|\d+\.)/.test(summary)) errors.push('the title must be followed by a one-paragraph summary');
  const roots = (frontmatter.get('roots') ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return { roots, errors };
}

/**
 * Findings for every alignment folder among `files`: folder name, README shape and `roots` exactly beside a codemod,
 * the shape `pnpm cella align` reads.
 */
export function alignmentFindings(files: string[], read: (file: string) => string): Finding[] {
  const folders = new Map<string, string[]>();
  for (const file of files) {
    if (!file.startsWith(alignmentsDir)) continue;
    const [folder, ...rest] = file.slice(alignmentsDir.length).split('/');
    if (rest.length === 0) continue;
    folders.set(folder, [...(folders.get(folder) ?? []), rest.join('/')]);
  }

  const findings: Finding[] = [];
  const finding = (file: string, message: string, line?: number) =>
    findings.push({ file, rule: 'alignment', message, ...(line === undefined ? {} : { line, column: 1 }) });
  for (const [folder, names] of folders) {
    const readme = `${alignmentsDir}${folder}/README.md`;
    if (!alignmentIdPattern.test(folder)) finding(`${alignmentsDir}${folder}`, 'alignment folders are named <YYYYMMDDThhmm>-<slug>');
    if (!names.includes('README.md')) {
      finding(`${alignmentsDir}${folder}`, 'alignment folder has no README.md');
      continue;
    }
    const { roots, errors } = checkAlignmentReadme(read(readme));
    for (const error of errors) finding(readme, error, 1);
    const codemods = names.filter((name) => !name.includes('/') && name.endsWith('.ts') && !name.endsWith('.test.ts'));
    if (codemods.length > 1) finding(readme, `one codemod per alignment, found ${codemods.join(', ')}`, 1);
    if (roots.length > 0 && codemods.length === 0) finding(readme, 'roots is only for an alignment with a codemod', 1);
    if (roots.length === 0 && codemods.length > 0) finding(readme, 'a codemod needs roots: the folders `pnpm cella align --run` scans by default', 1);
  }
  return findings;
}

/**
 * App-owned paths with nothing synced code depends on: content, brand files and generated output. `shared/config` is
 * here too, because the config type already reports a key an app's config lacks.
 */
const alignmentExempt = [
  'README.md',
  '.github/',
  'a11y/scope-config.ts',
  'frontend/public/',
  'frontend/src/content',
  'frontend/src/routes/routeTree.gen.ts',
  'frontend/src/styling/gradients.css',
  'infra/',
  'json/',
  'locales/',
  'sdk/gen',
  'shared/config',
];

/** The `ignored` and `pinned` entries of the sync config, read from its source text. */
export function ownedPaths(configSource: string): string[] {
  const lists = [...configSource.matchAll(/\b(?:ignored|pinned): \[([\s\S]*?)\n {4}\]/g)].map((match) => match[1]);
  return lists.flatMap((list) => [...list.matchAll(/^\s*'([^']+)',?\s*$/gm)].map((match) => match[1]));
}

/** What a branch changes against its base: every changed path, the paths it adds, and its commit messages. */
export interface BranchChanges {
  changed: string[];
  added: string[];
  messages: string;
}

/**
 * The finding for a branch that changes an app-owned path synced code reads from (a pinned file, `logo.tsx`,
 * `backend/drizzle`) without adding an alignment. Such a change never reaches an app's copy, so the app's synced code
 * breaks until someone tells it what to add. An `Alignment: none, <reason>` line in a commit message waives it.
 */
export function owedAlignmentFindings({ changed, added, messages }: BranchChanges, configSource: string): Finding[] {
  const owned = ownedPaths(configSource).filter((entry) => !alignmentExempt.some((exempt) => isUnder(entry, exempt)));
  // A Markdown file inside an owned folder is read by people, never by synced code
  const touched = changed.filter((file) => !file.endsWith('.md') && owned.some((entry) => isUnder(file, entry)));
  if (touched.length === 0) return [];
  const addsAlignment = added.some((file) => {
    const [folder, name, ...rest] = file.slice(alignmentsDir.length).split('/');
    return file.startsWith(alignmentsDir) && alignmentIdPattern.test(folder) && name === 'README.md' && rest.length === 0;
  });
  if (addsAlignment || /^Alignment: none\b.*\w/m.test(messages)) return [];
  return touched.map((file) => ({
    file,
    rule: 'alignment',
    message:
      'apps own this path and their synced code reads from it: add an alignment under cella/alignments/ in this branch, or put `Alignment: none, <reason>` in a commit message',
  }));
}
