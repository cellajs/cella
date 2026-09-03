import { describe, expect, it } from 'vitest';
import { findAppVocabularyFindings, loadAllowlist } from './check-app-vocabulary.ts';

const legacyTerm = ['fo', 'rk'].join('');

describe('findAppVocabularyFindings', () => {
  it('finds the term in prose, casing, plurals, and identifiers', () => {
    const source = [
      `// ${legacyTerm}-owned`,
      `const ${legacyTerm}Breaking = true`,
      legacyTerm.toUpperCase(),
      `${legacyTerm}s`,
    ].join('\n');

    expect(findAppVocabularyFindings('example.ts', source).map(({ line, term }) => ({ line, term }))).toEqual([
      { line: 1, term: legacyTerm },
      { line: 2, term: legacyTerm },
      { line: 3, term: legacyTerm.toUpperCase() },
      { line: 4, term: legacyTerm },
    ]);
  });

  it('finds the term in a file path', () => {
    const findings = findAppVocabularyFindings(`src/${legacyTerm}-config.ts`, 'export {};');

    expect(findings).toEqual([
      {
        file: `src/${legacyTerm}-config.ts`,
        line: 0,
        column: 5,
        term: legacyTerm,
        location: 'path',
      },
    ]);
  });

  it('allows the Cella CLI configuration', () => {
    expect(findAppVocabularyFindings('cella/cella.config.ts', legacyTerm)).toEqual([]);
  });

  it('allows the release-please changelogs, template and app root alike', () => {
    expect(findAppVocabularyFindings('cella/CHANGELOG.md', legacyTerm)).toEqual([]);
    expect(findAppVocabularyFindings('CHANGELOG.md', legacyTerm)).toEqual([]);
  });

  it('honours an app allowlist by file and by prefix', () => {
    const allowlist = { files: ['json/lucide-icon-names.json'], prefixes: ['frontend/public/static/generated/'] };
    expect(findAppVocabularyFindings('json/lucide-icon-names.json', `git-${legacyTerm}`, allowlist)).toEqual([]);
    expect(findAppVocabularyFindings('frontend/public/static/generated/icons.svg', legacyTerm, allowlist)).toEqual([]);
    expect(findAppVocabularyFindings('json/other.json', legacyTerm, allowlist)).toHaveLength(1);
  });
});

describe('loadAllowlist', () => {
  it('merges the template allowlist with the app-owned file', async () => {
    const allowlist = await loadAllowlist();
    expect(allowlist.files).toContain('cella/CHANGELOG.md');
    expect(allowlist.prefixes).toContain('cella/migrations/');
  });
});
