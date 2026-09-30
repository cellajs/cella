import { describe, expect, it } from 'vitest';
import { docFindings } from './check-doc-style.ts';

const singular = ['invar', 'iant'].join('');
const dash = '—';
const found = (file: string, source: string) =>
  docFindings(file, source).map(({ line, column, rule, term, review }) => ({ line, column, rule, term, review }));

describe('docFindings', () => {
  it('finds the concrete-language term in any case or plural, never inside longer words', () => {
    const source = [`# ${singular}`, `${singular}s`.toUpperCase(), `source-${singular}`, 'invariance, invariantly'];

    expect(found('guide.md', source.join('\n')).map(({ line, column, term }) => ({ line, column, term }))).toEqual([
      { line: 1, column: 3, term: singular },
      { line: 2, column: 1, term: `${singular}s`.toUpperCase() },
      { line: 3, column: 8, term: singular },
    ]);
  });

  it('reads prose only: inline code, fenced code and link targets are masked', () => {
    const source = [
      `Sync is lazy ${dash} rows arrive on demand.`,
      `Never write \`${dash}\` or \`load-bearing\`.`,
      '[reference](https://example.com/load-bearing)',
      '```text',
      `${singular} ${dash} load-bearing`,
      '```',
    ].join('\n');

    expect(found('guide.mdx', source)).toEqual([{ line: 1, column: 14, rule: 'em-dash', term: dash, review: false }]);
  });

  it('marks lower-confidence vocabulary as review and load-bearing as required', () => {
    const source = 'The wiring is load bearing and silently surfaces a seam.';

    expect(found('guide.md', source).map(({ term, review }) => `${term}:${review}`)).toEqual([
      'load bearing:false',
      'seam:true',
      'surfaces:true',
      'wiring:true',
      'silently:true',
    ]);
  });

  it('skips changelogs, non-doc files, and agent wording in migration notes and infra', () => {
    expect(found('CHANGELOG.md', `${dash} ${singular}`)).toEqual([]);
    expect(found('guide.txt', `${dash} ${singular}`)).toEqual([]);
    expect(found('cella/migrations/x/README.md', 'This lands load-bearing code.')).toEqual([]);
    expect(found('infra/README.md', `A ${dash} here.`)).toHaveLength(1);
  });
});
