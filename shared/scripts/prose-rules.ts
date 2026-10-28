import type { Finding } from './repo-files.ts';

/** A wording rule, read in every source comment. */
export interface ProseRule {
  /** The rule id each finding prints in brackets. */
  name: string;
  pattern: RegExp;
  /** `required` fails `pnpm style`; `review` prints under `pnpm style:audit` only. */
  level: 'required' | 'review';
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
const agentWording = { level: 'review', docs: true, exclude: /^(?:cella\/alignments\/|infra\/)/ } as const;

/**
 * Files no prose rule reads, on top of a rule's own `exclude` and the app's `proseExclude`: in source, migrations,
 * the alignment folders and generated code; in docs, the changelogs release-please writes from commit messages.
 */
export function isProseExempt(file: string, kind: 'source' | 'doc'): boolean {
  if (kind === 'doc') return file.endsWith('CHANGELOG.md');
  return ['backend/drizzle/', 'cella/alignments/', 'sdk/gen/'].some((prefix) => file.startsWith(prefix)) || file.includes('.gen.');
}

/** The rules the comment and doc checks apply; a required one also gets its line in the README. */
export const proseRules: ProseRule[] = [
  { name: 'em-dash', pattern: /\u2014/, level: 'required', message: 'split the sentence, use a colon, or drop the clause', docs: true, text: true },
  {
    name: 'contrast-phrase',
    pattern: /\b(?:instead|rather than|as opposed to)\b/i,
    level: 'required',
    message: 'state the current behavior or local constraint directly',
  },
  {
    name: 'concrete-language',
    pattern: /\binvariants?\b/i,
    level: 'required',
    message: 'name the precise rule, constraint, guarantee, requirement, contract, precondition, or assumption',
    docs: true,
  },
  {
    name: 'change-history',
    pattern: /\b(?:previously|formerly|used to|originally)\b/i,
    level: 'required',
    message: 'move evolution history to the commit or an alignment',
  },
  {
    name: 'review-conversation',
    pattern: /\b(?:maybe|perhaps|we (?:should|could|might)|(?:was|were) considered)\b/i,
    level: 'required',
    message: 'resolve the question or track it outside the source comment',
  },
  {
    name: 'compatibility-language',
    pattern: /\b(?:legacy|no longer|old (?:behavior|approach|path|implementation|code))\b/i,
    level: 'review',
    message: 'confirm that this describes an active compatibility contract',
  },
  {
    name: 'temporary-reasoning',
    pattern: /\b(?:for now|workaround|hack|temporary|temporarily)\b/i,
    level: 'review',
    message: 'state the active constraint or link tracked follow-up work',
  },
  {
    name: 'materialization-jargon',
    // The Yjs operation is the word's one use: a comment that names Yjs, the relay or a collaborative document passes.
    pattern: /(?<!\b(?:yjs|relay|collaborative)\b[\s\S]*)\bmateriali[sz](?:e|ed|es|ing|ation|ations)\b(?![\s\S]*\b(?:yjs|relay|collaborative)\b)/i,
    level: 'review',
    message: 'use a concrete verb unless this names the formal Yjs operation',
    exclude: /yjs/i,
  },
  {
    name: 'load-bearing',
    pattern: /\bload(?:-| )bearing\b/i,
    ...agentWording,
    level: 'required',
    message: 'name the dependency, requirement, or failure consequence directly',
  },
  {
    name: 'authoritative',
    pattern: /\bauthoritative(?:ly)?\b/i,
    ...agentWording,
    level: 'required',
    message: 'say who decides or which value counts: the backend decides, the stored row, the exact count',
  },
  {
    name: 'boundary-metaphor',
    pattern: /\bseams?\b/i,
    ...agentWording,
    message: 'consider boundary, interface, integration point, or the named call site',
  },
  {
    name: 'delivery-metaphor',
    pattern: /\b(?:land|lands|landed)\b/i,
    ...agentWording,
    message: 'consider merge, deploy, store, arrive, or take effect',
  },
  {
    name: 'surface-as-verb',
    // The noun names a placement surface (`appConfig.surfaces`): a bare form counts as a verb only after a modal, a
    // negation or an adverb.
    pattern: /\bsurfac(?:ed|ing)\b|(?<=\b(?:to|will|would|can|could|may|might|must|should|shall|not|never|still|also|\w+ly)\s+)surfaces?\b/i,
    ...agentWording,
    message: 'prefer report, show, return, or expose',
  },
  {
    name: 'wiring-metaphor',
    pattern: /\b(?:wiring|wired)\b/i,
    ...agentWording,
    message: 'name the registration, connection, configuration, or call',
  },
  {
    name: 'scaffold-metaphor',
    pattern: /\bscaffold(?:s|ed|ing)?\b/i,
    ...agentWording,
    message: 'consider template, generated starting code, or the concrete setup step',
  },
  { name: 'threshold-metaphor', pattern: /\bfloor\b/i, ...agentWording, message: 'when describing a threshold, prefer minimum or lower bound' },
  {
    name: 'agent-emphasis',
    pattern: /\b(?:decisive|genuinely|cleanly|honest (?:answer|caveat|take))\b/i,
    ...agentWording,
    message: 'remove the emphasis or state the exact result or limitation',
  },
  { name: 'silent-behavior', pattern: /\bsilent(?:ly)?\b/i, ...agentWording, message: 'state which error, log, record, or notification is absent' },
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
    review: rule.level === 'review',
  }));
}
