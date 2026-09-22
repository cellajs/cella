import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findAppVocabularyFindings, findProductNameFindings, loadAllowlist } from './check-app-vocabulary.ts';

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

  it('skips the sync marker comments but not the term elsewhere on the same lines', () => {
    const source = [
      `const a = 1; // ${legacyTerm}: keeps the app's default`,
      `/* ${legacyTerm}: multi`,
      `   line */ const ${legacyTerm}Config = {};`,
      `<!-- ${legacyTerm}: app copy -->`,
    ].join('\n');

    expect(
      findAppVocabularyFindings('example.ts', source).map(({ line, column, term }) => ({ line, column, term })),
    ).toEqual([{ line: 3, column: 18, term: legacyTerm }]);
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
        rule: 'source-control-term',
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

describe('findProductNameFindings', () => {
  const name = ['cel', 'la'].join('');

  it('finds the product name in identifiers, claims, DNS records and URLs of app logic', () => {
    const source = [
      `const claim = '${name}_kind';`,
      `type ${name[0].toUpperCase()}${name.slice(1)}TokenClaims = {};`,
      `const host = \`_${name}-verification.\${domain}\`;`,
      `const url = 'https://www.${name}js.com/mcp';`,
    ].join('\n');
    expect(
      findProductNameFindings('backend/src/modules/x/x.ts', source).map(({ line, term }) => ({ line, term })),
    ).toEqual([
      { line: 1, term: `${name}_k` },
      { line: 2, term: 'CellaT' },
      { line: 3, term: `_${name}-` },
      { line: 4, term: `${name}js.com` },
    ]);
  });

  it('leaves prose, tags and ownership markers alone', () => {
    const source = [
      `// none in ${name}; apps with other vocabularies add theirs`,
      `tags: ['me', '${name}'],`,
      `owner: '${name}',`,
    ].join('\n');
    expect(findProductNameFindings('backend/src/modules/x/x.ts', source)).toEqual([]);
  });

  it('covers logic roots only, never tests, config, docs or the marketing site', () => {
    const source = `const url = 'https://www.${name}js.com';`;
    expect(findProductNameFindings('backend/src/x.test.ts', source)).toEqual([]);
    expect(findProductNameFindings('shared/config/config.default.ts', source)).toEqual([]);
    expect(findProductNameFindings('frontend/src/modules/marketing/about.tsx', source)).toEqual([]);
    expect(findProductNameFindings('frontend/src/content/docs/x.mdx', source)).toEqual([]);
    expect(findProductNameFindings('infra/lib/x.ts', source)).toEqual([]);
    expect(findProductNameFindings('frontend/src/modules/me/x.tsx', source)).toHaveLength(1);
  });
});

describe('loadAllowlist', () => {
  it('merges the app-owned file into the template allowlist', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vocabulary-allowlist-'));
    mkdirSync(join(root, 'shared/config'), { recursive: true });
    writeFileSync(
      join(root, 'shared/config/vocabulary-allowlist.ts'),
      "export const vocabularyAllowlist = { files: ['json/lucide-icon-names.json'], prefixes: ['generated/'] };\n",
    );

    const allowlist = await loadAllowlist(root);
    expect(allowlist.files).toEqual(expect.arrayContaining(['cella/CHANGELOG.md', 'json/lucide-icon-names.json']));
    expect(allowlist.prefixes).toEqual(['cella/migrations/', 'generated/']);
  });

  it('falls back to the template allowlist without the app file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vocabulary-allowlist-'));
    expect((await loadAllowlist(root)).prefixes).toEqual(['cella/migrations/']);
  });
});
