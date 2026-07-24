import { describe, expect, it } from 'vitest';
import {
  findAgentVocabularyFindings,
  findDocStyleViolations,
  formatAgentVocabularyFinding,
  formatDocStyleViolation,
} from './check-doc-style';

const singular = ['invar', 'iant'].join('');
const plural = `${singular}s`;

describe('findDocStyleViolations', () => {
  it('finds singular, plural, case, hyphenated, and code-example uses', () => {
    const source = [
      `# ${singular}`,
      '',
      plural.toUpperCase(),
      '',
      `source-${singular}`,
      '',
      `\`${singular}\``,
    ].join('\n');

    expect(findDocStyleViolations('guide.md', source)).toEqual([
      { file: 'guide.md', line: 1, column: 3, term: singular },
      { file: 'guide.md', line: 3, column: 1, term: plural.toUpperCase() },
      { file: 'guide.md', line: 5, column: 8, term: singular },
      { file: 'guide.md', line: 7, column: 2, term: singular },
    ]);
  });

  it('reports ordinary prose with an actionable location and alternatives', () => {
    const violation = findDocStyleViolations('guide.md', `This ${singular} matters.`)[0]!;

    expect(formatDocStyleViolation(violation)).toBe(
      [
        `guide.md:1:6 replace "${singular}" with a precise rule, constraint, guarantee,`,
        'requirement, contract, precondition, or assumption',
      ].join(' '),
    );
  });

  it('does not match longer neighboring words', () => {
    expect(findDocStyleViolations('guide.mdx', 'invariance and invariantly')).toEqual([]);
  });
});

describe('findAgentVocabularyFindings', () => {
  it('requires concrete language for load-bearing metaphors', () => {
    const source = ['This is load-bearing.', 'That is load bearing.'].join('\n');

    expect(findAgentVocabularyFindings('guide.md', source)).toEqual([
      {
        file: 'guide.md',
        line: 1,
        column: 9,
        term: 'load-bearing',
        rule: 'load-bearing',
        message: 'name the dependency, requirement, or failure consequence directly',
      },
      {
        file: 'guide.md',
        line: 2,
        column: 9,
        term: 'load bearing',
        rule: 'load-bearing',
        message: 'name the dependency, requirement, or failure consequence directly',
      },
    ]);
  });

  it('ignores inline code, fenced code, and link targets', () => {
    const source = [
      '`load-bearing` is discussed here.',
      '[reference](https://example.com/load-bearing)',
      '```text',
      'load-bearing',
      '```',
    ].join('\n');

    expect(findAgentVocabularyFindings('guide.md', source)).toEqual([]);
  });

  it('reports lower-confidence vocabulary only in review mode', () => {
    const source = 'The wiring silently surfaces a seam.';

    expect(findAgentVocabularyFindings('guide.md', source)).toEqual([]);
    expect(findAgentVocabularyFindings('guide.md', source, 'review').map((item) => item.term)).toEqual(
      ['wiring', 'silently', 'surfaces', 'seam'],
    );
  });

  it('formats review findings with the rule and replacement guidance', () => {
    const finding = findAgentVocabularyFindings(
      'guide.md',
      'This lands tomorrow.',
      'review',
    )[0]!;

    expect(formatAgentVocabularyFinding(finding)).toBe(
      'guide.md:1:6 [delivery-metaphor] "lands": consider merge, deploy, store, arrive, or take effect',
    );
  });
});
