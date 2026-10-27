import { describe, expect, it } from 'vitest';
import { alignmentFindings, owedAlignmentFindings, ownedPaths, parseAlignment } from './check-alignments.ts';

const lines = (...rows: string[]) => rows.join('\n');
const alignment = lines(
  '---',
  'syncBreaking: true',
  'clientCacheBump: false',
  'caughtBy: compiler',
  'grep: principalId, principal_id',
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

describe('parseAlignment', () => {
  it('reads the codemod roots of a well-formed README', () => {
    expect(parseAlignment(alignment)).toEqual({ roots: ['backend/src', 'frontend/src'], errors: [] });
  });

  it('reports a missing frontmatter block, title and summary', () => {
    expect(parseAlignment(lines('# Title', '', '## What & why')).errors).toEqual([
      'must open with a `---` frontmatter block',
      'the title must be followed by a one-paragraph summary',
    ]);
    expect(parseAlignment(lines('---', 'syncBreaking: false', 'clientCacheBump: false', '---', '', 'Text')).errors).toEqual([
      'the first line after the frontmatter must be the `# ` title',
      'the title must be followed by a one-paragraph summary',
    ]);
  });

  it('reports unknown keys, missing flags, flags that are not booleans and a sync-breaking change without caughtBy', () => {
    const source = lines('---', 'syncBreaking: yes', 'version: next', '---', '', '# Title', '', 'Summary.');
    expect(parseAlignment(source).errors).toEqual([
      'syncBreaking must be true or false',
      'unknown frontmatter key: version',
      'frontmatter is missing clientCacheBump',
    ]);
    const breaking = (...keys: string[]) =>
      parseAlignment(lines('---', 'syncBreaking: true', 'clientCacheBump: false', ...keys, '---', '', '# Title', '', 'Summary.')).errors;
    expect(breaking()).toEqual(['a sync-breaking alignment says how an app finds its leftovers: caughtBy']);
    expect(breaking('caughtBy: typecheck')).toEqual(['caughtBy must be one of compiler, tests, nothing']);
  });
});

describe('alignmentFindings', () => {
  const read = (sources: Record<string, string>) => (file: string) => sources[file];
  const messages = (files: string[], sources: Record<string, string>) =>
    alignmentFindings(files, read(sources)).map(({ file, message }) => `${file}: ${message}`);

  it('passes a well-formed alignment and ignores the files beside the folders', () => {
    const files = [
      'cella/alignments/README.md',
      'cella/alignments/_TEMPLATE.md',
      'cella/alignments/20261002T0614-config-switch/README.md',
      'cella/alignments/20261002T0614-config-switch/rename.ts',
    ];
    expect(messages(files, { 'cella/alignments/20261002T0614-config-switch/README.md': alignment })).toEqual([]);
  });

  it('flags a bad folder name, a folder without README, roots without a codemod and a codemod without roots', () => {
    const files = [
      'cella/alignments/config-switch/README.md',
      'cella/alignments/20261002T0614-no-readme/rename.ts',
      'cella/alignments/20261002T0615-manual/README.md',
      'cella/alignments/20261002T0616-no-roots/README.md',
      'cella/alignments/20261002T0616-no-roots/rename.ts',
    ];
    const sources = {
      'cella/alignments/config-switch/README.md': alignment,
      'cella/alignments/20261002T0615-manual/README.md': alignment,
      'cella/alignments/20261002T0616-no-roots/README.md': alignment.replace('roots: backend/src, frontend/src\n', ''),
    };
    expect(messages(files, sources)).toEqual([
      'cella/alignments/config-switch: alignment folders are named <YYYYMMDDThhmm>-<slug>',
      'cella/alignments/config-switch/README.md: roots is only for an alignment with a codemod',
      'cella/alignments/20261002T0614-no-readme: alignment folder has no README.md',
      'cella/alignments/20261002T0615-manual/README.md: roots is only for an alignment with a codemod',
      'cella/alignments/20261002T0616-no-roots/README.md: a codemod needs roots: the folders `pnpm cella align --run` scans by default',
    ]);
  });
});

describe('owedAlignmentFindings', () => {
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
  const rule = (changed: string[], messages = '', added = changed) =>
    owedAlignmentFindings({ changed, added, messages }, config).map((finding) => finding.file);

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

  it('asks for an alignment when a branch changes an app-owned path synced code reads from', () => {
    expect(rule(['frontend/src/modules/common/logo.tsx', 'frontend/src/modules/auth/auth-layout.tsx'])).toEqual([
      'frontend/src/modules/common/logo.tsx',
    ]);
    expect(rule(['backend/drizzle/20261004_x/migration.sql', 'backend/src/modules.ts'])).toEqual([
      'backend/drizzle/20261004_x/migration.sql',
      'backend/src/modules.ts',
    ]);
  });

  it('leaves content, brand files, generated output, config and Markdown alone', () => {
    expect(
      rule([
        'README.md',
        'shared/config/config.default.ts',
        'locales/en/app.json',
        'json/text-blocks.json',
        'backend/drizzle/README.md',
        'backend/src/modules/auth/x.ts',
      ]),
    ).toEqual([]);
  });

  it('is met by an alignment the branch adds or a reasoned waiver in a commit message', () => {
    const logo = 'frontend/src/modules/common/logo.tsx';
    const readme = 'cella/alignments/20261004T1215-logo-title/README.md';
    expect(rule([logo, readme])).toEqual([]);
    expect(rule([logo, readme], '', [])).toEqual([logo]);
    expect(rule([logo, 'cella/alignments/README.md'])).toEqual([logo]);
    expect(rule([logo], 'fix: logo\n\nAlignment: none, comment only')).toEqual([]);
    expect(rule([logo], 'fix: logo\n\nAlignment: none')).toEqual([logo]);
  });
});
