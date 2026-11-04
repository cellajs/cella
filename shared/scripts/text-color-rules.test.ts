import { describe, expect, it } from 'vitest';
import { textColorFindings } from './text-color-rules.ts';

const file = 'frontend/src/modules/example/example.tsx';
const findings = (source: string, path = file) => textColorFindings(path, source).map(({ term }) => term);

describe('textColorFindings', () => {
  it('fails a modified text token and a palette gray, in any class string and under any variant but a disabled one', () => {
    const source = [
      "const a = cn('text-muted-foreground/70', active && 'hover:text-foreground/80');",
      'const b = <p className="text-slate-400">x</p>;',
      "const c = tw('disabled:not-aria-busy:text-foreground/40 text-faint-foreground');",
    ].join('\n');
    expect(findings(source)).toEqual(['text-muted-foreground/70', 'hover:text-foreground/80', 'text-slate-400']);
  });

  it('keeps palette grays in the excepted docs paths', () => {
    expect(findings("const color = 'text-gray-600 dark:text-gray-400';", 'frontend/src/modules/docs/operations/method-label.tsx')).toEqual([]);
  });
});
