/** Prose rules over authored Markdown and MDX; code, fenced blocks and link targets are masked. */
import { extname } from 'node:path';
import { proseRules, ruleFindings } from './prose-rules.ts';
import { type Finding, lineColumn } from './repo-files.ts';

const docExtensions = new Set(['.md', '.mdx']);
const docRules = proseRules.filter((rule) => rule.docs);
const blank = (text: string) => ' '.repeat(text.length);

/** Each line outside fenced code through `mask`; fences and fenced code blanked to spaces, so positions hold. */
function outsideFences(source: string, mask: (line: string) => string): string {
  let inFence = false;
  return source
    .split('\n')
    .map((line) => {
      if (/^\s*(?:```|~~~)/.test(line)) inFence = !inFence;
      else if (!inFence) return mask(line);
      return blank(line);
    })
    .join('\n');
}

/** The prose view: inline code, fenced code and link targets blanked to spaces, so positions hold. */
function maskMarkdownCode(source: string): string {
  return outsideFences(source, (line) => line.replace(/\]\([^)]+\)/g, (match) => `]${blank(match.slice(1))}`).replace(/`[^`\n]*`/g, blank));
}

/** Inline code in a link label: the docs draw code as a chip that hides the link underline. Double-backtick spans show the pattern as an example. */
function codeLinkFindings(file: string, source: string): Finding[] {
  const text = outsideFences(source, (line) => line.replace(/``.+?``/g, blank));
  return [...text.matchAll(/(?<!!)\[[^[\]\n]*`[^`[\]\n]+`[^[\]\n]*\](?=[([])/g)].map((match) => ({
    file,
    ...lineColumn(text, match.index),
    rule: 'code-in-link',
    term: match[0],
    message: 'drop the backticks inside the link label: the code chip hides the link underline',
    review: false,
  }));
}

/** Rule findings in one Markdown or MDX file; changelogs are generated from commit messages and skipped. */
export function docFindings(file: string, source: string): Finding[] {
  if (!docExtensions.has(extname(file).toLowerCase()) || file.endsWith('CHANGELOG.md')) return [];
  const prose = maskMarkdownCode(source);
  return [...docRules.flatMap((rule) => ruleFindings(rule, file, prose, (index) => lineColumn(prose, index))), ...codeLinkFindings(file, source)];
}
