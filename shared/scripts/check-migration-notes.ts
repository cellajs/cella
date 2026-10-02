/**
 * Shape of the migration notes in `cella/migrations/<id>/`: each folder holds a README.md that opens with frontmatter,
 * then the title and a one-paragraph summary. `cella/migrations/run.ts` reads notes with the same parser.
 */
import type { Finding } from './repo-files.ts';

/** A note folder name: `<YYYYMMDDThhmm>-<slug>`, UTC minute precision. */
export const noteIdPattern = /^\d{8}T\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

const notesDir = 'cella/migrations/';

/** One note README, parsed. Fields fall back to empty values when `errors` is not empty. */
export interface MigrationNote {
  /** Changes upstream in a way app-specific code must follow. */
  syncBreaking: boolean;
  /** Bumped `clientCacheVersion` or shipped a lens module. */
  clientCacheBump: boolean;
  /** Default scan roots for the codemod; empty for a note without one. */
  roots: string[];
  /** The `# ` heading. */
  title: string;
  /** The paragraph under the title. */
  summary: string;
  errors: string[];
}

const booleanKeys = ['syncBreaking', 'clientCacheBump'] as const;

/** The lines after the frontmatter, without HTML comment lines (a comment opens at the start of a line). */
function bodyLines(lines: string[]): string[] {
  let inComment = false;
  return lines.filter((line) => {
    if (!inComment && !line.trimStart().startsWith('<!--')) return true;
    inComment = !line.includes('-->');
    return false;
  });
}

/** Parse a note README; every shape problem lands in `errors`. */
export function parseMigrationNote(source: string): MigrationNote {
  const note: MigrationNote = { syncBreaking: false, clientCacheBump: false, roots: [], title: '', summary: '', errors: [] };
  const lines = source.replace(/\r\n/g, '\n').split('\n');

  const close = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  if (close === -1) note.errors.push('must open with a `---` frontmatter block');
  const seen = new Set<string>();
  for (const line of lines.slice(1, Math.max(close, 1))) {
    const match = /^(\w+):\s*(.*)$/.exec(line);
    if (!match) {
      note.errors.push(`frontmatter line is not \`key: value\`: ${line}`);
      continue;
    }
    const [, key, value] = match;
    seen.add(key);
    if (key === 'roots')
      note.roots = value
        .split(',')
        .map((root) => root.trim())
        .filter(Boolean);
    else if (booleanKeys.includes(key as (typeof booleanKeys)[number])) {
      if (value !== 'true' && value !== 'false') note.errors.push(`${key} must be true or false`);
      note[key as (typeof booleanKeys)[number]] = value === 'true';
    } else note.errors.push(`unknown frontmatter key: ${key}`);
  }
  for (const key of booleanKeys) if (close !== -1 && !seen.has(key)) note.errors.push(`frontmatter is missing ${key}`);

  // Body: the title, then the summary paragraph. Blank lines and HTML comments in between are skipped.
  const body = bodyLines(lines.slice(close + 1)).join('\n');
  const blocks = body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const title = /^# (.+)$/.exec(blocks[0] ?? '');
  if (!title || blocks[0].includes('\n')) note.errors.push('the first line after the frontmatter must be the `# ` title');
  else note.title = title[1].trim();
  const summary = blocks[1] ?? '';
  if (!summary || /^(#|>|[-*|]|```|\d+\.)/.test(summary)) note.errors.push('the title must be followed by a one-paragraph summary');
  else note.summary = summary.replace(/\s*\n\s*/g, ' ');
  return note;
}

/** The note's codemod: the one non-test `.ts` file among `fileNames`, or null. */
export function noteCodemod(fileNames: string[]): string | null {
  return fileNames.find((name) => name.endsWith('.ts') && !name.endsWith('.test.ts')) ?? null;
}

/** Findings for every note folder among `files`: folder name, README shape, and `roots` only beside a codemod. */
export function migrationNoteFindings(files: string[], read: (file: string) => string): Finding[] {
  const folders = new Map<string, string[]>();
  for (const file of files) {
    if (!file.startsWith(notesDir)) continue;
    const [folder, ...rest] = file.slice(notesDir.length).split('/');
    if (rest.length === 0) continue;
    folders.set(folder, [...(folders.get(folder) ?? []), rest.join('/')]);
  }

  const findings: Finding[] = [];
  const finding = (file: string, message: string, line?: number) =>
    findings.push({ file, rule: 'migration-note', message, ...(line === undefined ? {} : { line, column: 1 }) });
  for (const [folder, names] of folders) {
    const readme = `${notesDir}${folder}/README.md`;
    if (!noteIdPattern.test(folder)) finding(`${notesDir}${folder}`, 'note folders are named <YYYYMMDDThhmm>-<slug>');
    if (!names.includes('README.md')) {
      finding(`${notesDir}${folder}`, 'note folder has no README.md');
      continue;
    }
    const note = parseMigrationNote(read(readme));
    for (const error of note.errors) finding(readme, error, 1);
    const codemods = names.filter((name) => !name.includes('/') && name.endsWith('.ts') && !name.endsWith('.test.ts'));
    if (codemods.length > 1) finding(readme, `one codemod per note, found ${codemods.join(', ')}`, 1);
    if (note.roots.length > 0 && codemods.length === 0) finding(readme, 'roots is only for a note with a codemod', 1);
  }
  return findings;
}
