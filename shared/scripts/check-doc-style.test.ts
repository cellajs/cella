import { describe, expect, it } from 'vitest';
import { findDocStyleViolations, formatDocStyleViolation } from './check-doc-style';

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
