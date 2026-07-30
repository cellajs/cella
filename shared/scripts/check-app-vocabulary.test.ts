import { describe, expect, it } from 'vitest';
import { findAppVocabularyFindings } from './check-app-vocabulary';

const legacyTerm = ['fo', 'rk'].join('');

describe('findAppVocabularyFindings', () => {
  it('finds the term in prose, casing, plurals, and identifiers', () => {
    const source = [
      `// ${legacyTerm}-owned`,
      `const ${legacyTerm}Breaking = true`,
      legacyTerm.toUpperCase(),
      `${legacyTerm}s`,
    ].join('\n');

    expect(
      findAppVocabularyFindings('example.ts', source).map(({ line, term }) => ({ line, term })),
    ).toEqual([
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
});
