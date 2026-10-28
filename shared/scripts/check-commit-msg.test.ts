import { describe, expect, it } from 'vitest';
import { commitMessageErrors } from './check-commit-msg.ts';

describe('commitMessageErrors', () => {
  it.each([
    'feat: add short links',
    'fix(frontend): a tab bar opens on its active tab',
    'feat(bench)!: own load runner replaces Artillery',
    'chore(deps)!: 330 fewer packages, lighter images',
    'refactor: keep `Eslint` configuration in one place...',
  ])('passes %s', (message) => {
    expect(commitMessageErrors(message)).toEqual([]);
  });

  it('reads the header after comment lines and stops at the scissors line', () => {
    const message = [
      '',
      'fix: one esbuild for every workspace',
      '',
      'Body text that may run long, with Capitals and a full stop.',
      '# Please enter the commit message for your changes.',
      '# ------------------------ >8 ------------------------',
      'Feat: diff below the scissors.',
    ].join('\n');
    expect(commitMessageErrors(message)).toEqual([]);
  });

  it.each([
    "Merge branch 'main' into chore/deps-reduction",
    'Merge pull request #1437 from cellajs/feat/bench-runner',
    'Revert "feat: add short links"',
    'fixup! fix: one esbuild for every workspace',
    'chore: 0.21.0',
  ])('skips the generated message %s', (message) => {
    expect(commitMessageErrors(message)).toEqual([]);
  });

  it.each([
    ['add short links', 'header must read'],
    ['feature: add short links', 'type "feature" must be one of'],
    ['Feat: add short links', 'type "Feat" must be one of'],
    ['fix: Add short links', 'subject must not start with a capital letter'],
    ['docs: README links point at the docs site', 'subject must not start with a capital letter'],
    ['fix: add short links.', 'subject must not end with a full stop'],
    ['fix: ', 'header must read'],
    [' fix: add short links', 'header must not start or end with whitespace'],
    [`fix: ${'a'.repeat(116)}`, 'header is 121 characters, at most 120'],
    ["Fixed stuff.\n\nMerge branch 'main' into feat/x", 'header must read'],
  ])('rejects %j', (message, error) => {
    expect(commitMessageErrors(message).join('\n')).toContain(error);
  });

  it('allows a 120-character header', () => {
    expect(commitMessageErrors(`fix: ${'a'.repeat(115)}`)).toEqual([]);
  });
});
