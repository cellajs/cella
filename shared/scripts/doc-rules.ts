import { extname } from 'node:path';
import { isProseExempt, proseRules, ruleFindings } from './prose-rules.ts';
import { blankOut, type Finding, lineColumn } from './repo-files.ts';

const docExtensions = new Set(['.md', '.mdx']);
const docRules = proseRules.filter((rule) => rule.docs);

/** Each line outside fenced code through `mask`; fences and fenced code blanked to spaces, so positions hold. */
function outsideFences(source: string, mask: (line: string) => string): string {
  let inFence = false;
  return source
    .split('\n')
    .map((line) => {
      if (/^\s*(?:```|~~~)/.test(line)) inFence = !inFence;
      else if (!inFence) return mask(line);
      return blankOut(line);
    })
    .join('\n');
}

/** The prose view: inline code, fenced code and link targets blanked to spaces, so positions hold. */
function maskMarkdownCode(source: string): string {
  return outsideFences(source, (line) => line.replace(/\]\([^)]+\)/g, (match) => `]${blankOut(match.slice(1))}`).replace(/`[^`\n]*`/g, blankOut));
}

/** Inline code in a link label: the docs draw code as a chip that hides the link underline. Double-backtick spans show the pattern as an example. */
function codeLinkFindings(file: string, source: string): Finding[] {
  const text = outsideFences(source, (line) => line.replace(/``.+?``/g, blankOut));
  return [...text.matchAll(/(?<!!)\[[^[\]\n]*`[^`[\]\n]+`[^[\]\n]*\](?=[([])/g)].map((match) => ({
    file,
    ...lineColumn(text, match.index),
    rule: 'code-in-link',
    term: match[0],
    message: 'drop the backticks inside the link label: the code chip hides the link underline',
    review: false,
  }));
}

/** Rule findings in the prose of one Markdown or MDX file, and inline code in its link labels. */
export function docFindings(file: string, source: string): Finding[] {
  if (!docExtensions.has(extname(file).toLowerCase()) || isProseExempt(file, 'doc')) return [];
  const prose = maskMarkdownCode(source);
  return [...docRules.flatMap((rule) => ruleFindings(rule, file, prose, (index) => lineColumn(prose, index))), ...codeLinkFindings(file, source)];
}
