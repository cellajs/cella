import { describe, expect, it } from 'vitest';
import { migrationNoteFindings, owedNoteFindings, ownedPaths, parseMigrationNote } from './check-migration-notes.ts';

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

describe('migrationNoteFindings', () => {
  const read = (sources: Record<string, string>) => (file: string) => sources[file];
  const messages = (files: string[], sources: Record<string, string>) =>
    migrationNoteFindings(files, read(sources)).map(({ file, message }) => `${file}: ${message}`);

  it('passes a well-formed note and ignores the files beside the folders', () => {
    const files = [
      'cella/migrations/README.md',
      'cella/migrations/_TEMPLATE.md',
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

describe('owedNoteFindings', () => {
  const config = lines(
    'export default defineConfig({',
    '  overrides: {',
    '    ignored: [',
    "      'README.md',",
    "      'shared/config',",
    "      'backend/drizzle',",
    '      // App identity',
    "      'frontend/src/modules/common/logo.tsx',",
    "      'locales/en/app.json',",
    '    ],',
    '    pinned: [',
    "      'backend/src/modules.ts',",
    "      'json/text-blocks.json',",
    '    ],',
    '  },',
    '});',
  );
  const rule = (files: string[], messages = '') => owedNoteFindings(files, messages, config).map((finding) => finding.file);

  it('reads the ignored and pinned entries of the sync config', () => {
    expect(ownedPaths(config)).toEqual([
      'README.md',
      'shared/config',
      'backend/drizzle',
      'frontend/src/modules/common/logo.tsx',
      'locales/en/app.json',
      'backend/src/modules.ts',
      'json/text-blocks.json',
    ]);
  });

  it('asks for a note when a branch changes an app-owned path synced code reads from', () => {
    expect(rule(['frontend/src/modules/common/logo.tsx', 'frontend/src/modules/auth/auth-layout.tsx'])).toEqual([
      'frontend/src/modules/common/logo.tsx',
    ]);
    expect(rule(['backend/drizzle/20261004_x/migration.sql', 'backend/src/modules.ts'])).toEqual([
      'backend/drizzle/20261004_x/migration.sql',
      'backend/src/modules.ts',
    ]);
  });

  it('leaves content, brand files, generated output and config alone', () => {
    expect(
      rule(['README.md', 'shared/config/config.default.ts', 'locales/en/app.json', 'json/text-blocks.json', 'backend/src/modules/auth/x.ts']),
    ).toEqual([]);
  });

  it('is met by a note in the same branch or a reasoned waiver in a commit message', () => {
    const logo = 'frontend/src/modules/common/logo.tsx';
    expect(rule([logo, 'cella/migrations/20261004T1215-logo-title/README.md'])).toEqual([]);
    expect(rule([logo, 'cella/migrations/README.md'])).toEqual([logo]);
    expect(rule([logo], 'fix: logo\n\nMigration-Note: none, comment only')).toEqual([]);
    expect(rule([logo], 'fix: logo\n\nMigration-Note: none')).toEqual([logo]);
  });
});
