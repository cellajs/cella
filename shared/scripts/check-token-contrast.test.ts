import { describe, expect, it } from 'vitest';
import { tokenContrastFindings } from './check-token-contrast.ts';

const file = 'frontend/src/styling/tailwind.css';
const theme = (light: string[], dark: string[]) =>
  [
    '@layer base {',
    '  :root {',
    '    --background: oklch(1 0 0);',
    ...light.map((row) => `    ${row}`),
    '  }',
    '',
    '  .dark {',
    '    --background: oklch(0.2 0.01 285);',
    ...dark.map((row) => `    ${row}`),
    '  }',
    '}',
  ].join('\n');

describe('tokenContrastFindings', () => {
  it('passes tokens that carry their text and read as text on the page', () => {
    const source = theme(
      [
        '--foreground: oklch(0.2 0.01 285);',
        '--success: oklch(0.49 0.167 142.5);',
        '--success-foreground: oklch(0.985 0 0);',
        '--input: oklch(0.64 0.005 285);',
      ],
      [
        '--foreground: oklch(0.96 0 0);',
        '--success: oklch(0.72 0.2 142.5);',
        '--success-foreground: oklch(0.2 0.01 285);',
        '--input: oklch(0.54 0.011 285);',
      ],
    );
    expect(tokenContrastFindings(file, source)).toEqual([]);
  });

  it('reports a fill whose text is too faint, with the mode and both tokens', () => {
    const source = theme(['--success: oklch(0.59 0.2 142.5);', '--success-foreground: oklch(0.985 0 0);'], []);
    const messages = tokenContrastFindings(file, source).map(({ message }) => message);
    expect(messages).toContainEqual(
      expect.stringMatching(/^text on its fill is 3\.\d\d:1 in light mode, below 4\.5:1 \(--success-foreground on --success\)$/),
    );
  });

  it('judges dark mode with the light value of a token the dark block leaves out', () => {
    const source = theme(['--destructive: oklch(0.51 0.21 29);'], []);
    const dark = tokenContrastFindings(file, source).filter(({ message }) => message.includes('dark mode'));
    expect(dark.map(({ message }) => message)).toContainEqual(expect.stringContaining('status color as text'));
  });

  it('reports a field border below 3:1', () => {
    const source = theme(['--input: oklch(0.88 0.005 285);'], ['--input: oklch(0.54 0.011 285);']);
    const findings = tokenContrastFindings(file, source);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: 'token-contrast', term: '--input', line: 4 });
  });

  it('ignores every other file', () => {
    expect(tokenContrastFindings('frontend/src/styling/other.css', theme(['--input: oklch(0.99 0 0);'], []))).toEqual([]);
  });
});
