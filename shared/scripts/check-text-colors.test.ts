import { describe, expect, it } from 'vitest';
import { textColorFindings } from './check-text-colors.ts';

const file = 'frontend/src/modules/example/example.tsx';
const findings = (source: string, path = file) =>
  textColorFindings(path, source).map(({ term, review }) => (review ? `review ${term}` : `fail ${term}`));

describe('textColorFindings', () => {
  it('fails a modified text token and a palette gray, in any class string and under any variant but a disabled one', () => {
    const source = [
      "const a = cn('text-muted-foreground/70', active && 'hover:text-foreground/80');",
      'const b = <p className="text-slate-400">x</p>;',
      "const c = tw('disabled:not-aria-busy:text-foreground/40 text-faint-foreground');",
    ].join('\n');
    expect(findings(source)).toEqual(['fail text-muted-foreground/70', 'fail hover:text-foreground/80', 'fail text-slate-400']);
  });

  it('keeps palette grays in the excepted docs paths', () => {
    expect(findings("const color = 'text-gray-600 dark:text-gray-400';", 'frontend/src/modules/docs/operations/method-label.tsx')).toEqual([]);
  });

  it('marks opacity at rest on text for review, and leaves it alone on an icon, a hover state or screen reader text', () => {
    const source = [
      'const a = <span className="opacity-70">{title}</span>;',
      'const b = <div className="sm:opacity-80"><span>{name}</span></div>;',
      'const c = <ChevronDownIcon className="opacity-50" />;',
      'const d = <button className="opacity-70"><XIcon /><span className="sr-only">{label}</span></button>;',
      'const e = <span className="hover:opacity-70">{title}</span>;',
      "const f = tw('font-medium opacity-70');",
    ].join('\n');
    expect(findings(source)).toEqual(['review opacity-70', 'review sm:opacity-80', 'review opacity-70']);
  });
});
