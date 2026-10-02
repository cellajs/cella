import { describe, expect, it } from 'vitest';
import { migrationNoteFindings, noteCodemod, parseMigrationNote } from './check-migration-notes.ts';

const lines = (...rows: string[]) => rows.join('\n');
const note = lines(
  '---',
  'syncBreaking: true',
  'clientCacheBump: false',
  'roots: backend/src, frontend/src',
  '---',
  '',
  '<!-- authoring hint -->',
  '',
  '# Principal becomes actor',
  '',
  'The stored identity and the request-time value',
  'share one name.',
  '',
  '## What & why',
);

describe('parseMigrationNote', () => {
  it('reads the frontmatter, the title and the summary paragraph', () => {
    expect(parseMigrationNote(note)).toEqual({
      syncBreaking: true,
      clientCacheBump: false,
      roots: ['backend/src', 'frontend/src'],
      title: 'Principal becomes actor',
      summary: 'The stored identity and the request-time value share one name.',
      errors: [],
    });
  });

  it('reports a missing frontmatter block, title and summary', () => {
    expect(parseMigrationNote(lines('# Title', '', '## What & why')).errors).toEqual([
      'must open with a `---` frontmatter block',
      'the title must be followed by a one-paragraph summary',
    ]);
    expect(parseMigrationNote(lines('---', 'syncBreaking: false', 'clientCacheBump: false', '---', '', 'Text')).errors).toEqual([
      'the first line after the frontmatter must be the `# ` title',
      'the title must be followed by a one-paragraph summary',
    ]);
  });

  it('reports unknown keys, missing flags and flags that are not booleans', () => {
    const source = lines('---', 'syncBreaking: yes', 'version: next', '---', '', '# Title', '', 'Summary.');
    expect(parseMigrationNote(source).errors).toEqual([
      'syncBreaking must be true or false',
      'unknown frontmatter key: version',
      'frontmatter is missing clientCacheBump',
    ]);
  });
});

describe('noteCodemod', () => {
  it('is the one non-test .ts file in the folder', () => {
    expect(noteCodemod(['README.md', 'rename.test.ts', 'rename.ts'])).toBe('rename.ts');
    expect(noteCodemod(['README.md', 'renames.json'])).toBeNull();
  });
});

describe('migrationNoteFindings', () => {
  const read = (sources: Record<string, string>) => (file: string) => sources[file];
  const messages = (files: string[], sources: Record<string, string>) =>
    migrationNoteFindings(files, read(sources)).map(({ file, message }) => `${file}: ${message}`);

  it('passes a well-formed note and ignores the files beside the folders', () => {
    const files = [
      'cella/migrations/README.md',
      'cella/migrations/run.ts',
      'cella/migrations/20261002T0614-config-switch/README.md',
      'cella/migrations/20261002T0614-config-switch/rename.ts',
    ];
    expect(messages(files, { 'cella/migrations/20261002T0614-config-switch/README.md': note })).toEqual([]);
  });

  it('flags a bad folder name, a folder without README and roots without a codemod', () => {
    const files = [
      'cella/migrations/config-switch/README.md',
      'cella/migrations/20261002T0614-no-readme/rename.ts',
      'cella/migrations/20261002T0615-manual/README.md',
    ];
    const sources = { 'cella/migrations/config-switch/README.md': note, 'cella/migrations/20261002T0615-manual/README.md': note };
    expect(messages(files, sources)).toEqual([
      'cella/migrations/config-switch: note folders are named <YYYYMMDDThhmm>-<slug>',
      'cella/migrations/config-switch/README.md: roots is only for a note with a codemod',
      'cella/migrations/20261002T0614-no-readme: note folder has no README.md',
      'cella/migrations/20261002T0615-manual/README.md: roots is only for a note with a codemod',
    ]);
  });
});
