/** Prose rules over authored Markdown and MDX; code, fenced blocks and link targets are masked. */
import { extname } from 'node:path';
import { proseRules, ruleFindings } from './prose-rules.ts';
import { type Finding, lineColumn } from './repo-files.ts';

const docExtensions = new Set(['.md', '.mdx']);
const docRules = proseRules.filter((rule) => rule.docs);

/** The prose view: inline code, fenced code and link targets blanked to spaces, so positions hold. */
function maskMarkdownCode(source: string): string {
  let inFence = false;
  return source
    .split('\n')
    .map((line) => {
      if (/^\s*(?:```|~~~)/.test(line)) {
        inFence = !inFence;
        return ' '.repeat(line.length);
      }
      if (inFence) return ' '.repeat(line.length);
      return line.replace(/\]\([^)]+\)/g, (match) => `]${' '.repeat(match.length - 1)}`).replace(/`[^`\n]*`/g, (match) => ' '.repeat(match.length));
    })
    .join('\n');
}

/** Rule findings in one Markdown or MDX file; changelogs are generated from commit messages and skipped. */
export function docFindings(file: string, source: string): Finding[] {
  if (!docExtensions.has(extname(file).toLowerCase()) || file.endsWith('CHANGELOG.md')) return [];
  const prose = maskMarkdownCode(source);
  return docRules.flatMap((rule) => ruleFindings(rule, file, prose, (index) => lineColumn(prose, index)));
}
