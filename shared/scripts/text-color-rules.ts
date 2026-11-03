import { splitToken, stringTokens } from './class-tokens.ts';
import { type Finding, isFrontendSource, lineColumn } from './repo-files.ts';
import { parseSource } from './source-comments.ts';

/** Paths that keep palette grays, each with its reason. */
const paletteExceptions: Record<string, string> = {
  'frontend/src/modules/docs/': 'syntax, HTTP method and status colors, which carry meaning the theme steps do not',
  'frontend/src/modules/common/json-viewer/theme.ts': 'syntax colors of the JSON viewer',
};

const tokenModifier = /^text-[a-z-]*foreground(?:-soft)?\/[\w.[\]]+$/;
const paletteGray = /^text-(?:gray|slate|zinc|neutral|stone)-\d+(?:\/[\w.[\]]+)?$/;

/** Text color findings in one frontend file: a modified text token, or a palette gray outside the excepted paths. */
export function textColorFindings(file: string, source: string): Finding[] {
  if (!isFrontendSource(file) || !/text-/.test(source)) return [];
  const sourceFile = parseSource(file, source);
  const findings = new Map<number, Finding>();
  const report = (offset: number, term: string, message: string) => {
    findings.set(offset, { file, ...lineColumn(source, offset), rule: 'text-color', term, message });
  };
  const paletteAllowed = Object.keys(paletteExceptions).some((path) => file.startsWith(path));

  for (const { token, offset } of stringTokens(sourceFile, sourceFile)) {
    const { variants, base } = splitToken(token);
    if (tokenModifier.test(base) && !variants.some((variant) => variant.includes('disabled'))) {
      report(
        offset,
        token,
        'a text token takes no opacity modifier; pick the step: text-foreground-soft, text-muted-foreground or text-faint-foreground',
      );
    } else if (paletteGray.test(base) && !paletteAllowed) {
      report(offset, token, 'a palette gray skips the theme and the contrast setting; use a text step such as text-muted-foreground');
    }
  }
  return [...findings.values()];
}
