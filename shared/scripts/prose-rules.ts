import type { Finding } from './repo-files.ts';

/** A wording rule, read in every source comment. */
export interface ProseRule {
  /** The rule id each finding prints in brackets. */
  name: string;
  pattern: RegExp;
  /** The advice printed after the matched term. */
  message: string;
  /** Also read in Markdown and MDX prose. */
  docs?: boolean;
  /** Read in the whole text of a source file, strings and JSON values included, not only in its comments. */
  text?: boolean;
  /** Repo-relative paths the rule skips. */
  exclude?: RegExp;
}

/** Agent-associated wording, skipped in infra/ and in alignments, which address app maintainers. */
const agentWording = { docs: true, exclude: /^(?:cella\/alignments\/|infra\/)/ } as const;

/**
 * Files no prose rule reads, on top of a rule's own `exclude` and the app's `proseExclude`: in source, migrations,
 * the alignment folders and generated code; in docs, the changelogs release-please writes from commit messages.
 */
export function isProseExempt(file: string, kind: 'source' | 'doc'): boolean {
  if (kind === 'doc') return file.endsWith('CHANGELOG.md');
  return ['backend/drizzle/', 'cella/alignments/', 'sdk/gen/'].some((prefix) => file.startsWith(prefix)) || file.includes('.gen.');
}

/** The rules the comment and doc checks apply; each gets its line in the README. */
export const proseRules: ProseRule[] = [
  { name: 'em-dash', pattern: /\u2014/, message: 'split the sentence, use a colon, or drop the clause', docs: true, text: true },
  {
    name: 'contrast-phrase',
    pattern: /\b(?:instead|rather than|as opposed to)\b/i,
    message: 'state the current behavior or local constraint directly',
  },
  {
    name: 'concrete-language',
    pattern: /\binvariants?\b/i,
    message: 'name the precise rule, constraint, guarantee, requirement, contract, precondition, or assumption',
    docs: true,
  },
  {
    name: 'change-history',
    pattern: /\b(?:previously|formerly|used to|originally)\b/i,
    message: 'move evolution history to the commit or an alignment',
  },
  {
    name: 'review-conversation',
    pattern: /\b(?:maybe|perhaps|we (?:should|could|might)|(?:was|were) considered)\b/i,
    message: 'resolve the question or track it outside the source comment',
  },
  {
    name: 'load-bearing',
    pattern: /\bload(?:-| )bearing\b/i,
    ...agentWording,
    message: 'name the dependency, requirement, or failure consequence directly',
  },
  {
    name: 'authoritative',
    pattern: /\bauthoritative(?:ly)?\b/i,
    ...agentWording,
    message: 'say who decides or which value counts: the backend decides, the stored row, the exact count',
  },
];

/** A finding for every match of `rule` in `text`; `locate` maps an index in `text` to its line and column in `file`. */
export function ruleFindings(rule: ProseRule, file: string, text: string, locate: (index: number) => { line: number; column: number }): Finding[] {
  if (rule.exclude?.test(file) || !rule.pattern.test(text)) return [];
  const pattern = new RegExp(rule.pattern.source, `${rule.pattern.flags}g`);
  return [...text.matchAll(pattern)].map((match) => ({
    file,
    ...locate(match.index),
    rule: rule.name,
    term: match[0],
    message: rule.message,
  }));
}
