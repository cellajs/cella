/**
 * Prose rules for source comments and authored Markdown. `required` rules fail `pnpm style`; `review` rules are
 * reported by the audit modes only. A rule checks the targets it has a message for.
 */
export type ProseTarget = 'comments' | 'docs';

export interface ProseRule {
  name: string;
  pattern: RegExp;
  level: 'required' | 'review';
  message: Partial<Record<ProseTarget, string>>;
  /** Repo-relative paths the rule skips, per target. */
  exclude?: Partial<Record<ProseTarget, RegExp>>;
}

const both = (message: string) => ({ comments: message, docs: message });

/** Changelogs are generated from commit messages, not authored. */
const changelog = /CHANGELOG\.md$/;

/** Agent-associated wording, skipped in infra/ and in docs that are generated or address app maintainers. */
const agentWording = {
  level: 'review',
  exclude: { comments: /^infra\//, docs: /^(?:cella\/migrations\/|infra\/|sdk\/gen\/)|CHANGELOG\.md$/ },
} as const;

export const proseRules: ProseRule[] = [
  {
    name: 'em-dash',
    pattern: /\u2014/,
    level: 'required',
    message: {
      comments: 'split the sentence or remove the secondary clause',
      docs: 'split the sentence, use a colon, or drop the clause',
    },
    exclude: { docs: changelog },
  },
  {
    name: 'contrast-history',
    pattern: /\b(?:instead|rather than|as opposed to)\b/i,
    level: 'required',
    message: { comments: 'state the current behavior or local constraint directly' },
  },
  {
    name: 'concrete-language',
    pattern: /\binvariants?\b/i,
    level: 'required',
    message: {
      comments: 'name the precise rule, constraint, guarantee, requirement, contract, precondition, or assumption',
      docs: 'rule, constraint, guarantee, requirement, contract, precondition, or assumption',
    },
    exclude: { docs: changelog },
  },
  {
    name: 'change-history',
    pattern: /\b(?:previously|formerly|used to|originally)\b/i,
    level: 'required',
    message: { comments: 'move evolution history to the commit or migration documentation' },
  },
  {
    name: 'review-conversation',
    pattern: /\b(?:maybe|perhaps|we (?:should|could|might)|(?:was|were) considered)\b/i,
    level: 'required',
    message: { comments: 'resolve the question or track it outside the source comment' },
  },
  {
    name: 'compatibility-language',
    pattern: /\b(?:legacy|no longer|old (?:behavior|approach|path|implementation|code))\b/i,
    level: 'review',
    message: { comments: 'confirm that this describes an active compatibility contract' },
  },
  {
    name: 'temporary-reasoning',
    pattern: /\b(?:for now|workaround|hack|temporary|temporarily)\b/i,
    level: 'review',
    message: { comments: 'state the active constraint or link tracked follow-up work' },
  },
  {
    name: 'materialization-jargon',
    pattern: /\bmateriali[sz](?:e|ed|es|ing|ation|ations)\b/i,
    level: 'review',
    message: { comments: 'use a concrete verb unless this names the formal Yjs operation' },
  },
  {
    name: 'load-bearing',
    pattern: /\bload(?:-| )bearing\b/i,
    ...agentWording,
    level: 'required',
    message: both('name the dependency, requirement, or failure consequence directly'),
  },
  {
    name: 'boundary-metaphor',
    pattern: /\bseams?\b/i,
    ...agentWording,
    message: both('consider boundary, interface, integration point, or the named call site'),
  },
  {
    name: 'delivery-metaphor',
    pattern: /\b(?:land|lands|landed)\b/i,
    ...agentWording,
    message: both('consider merge, deploy, store, arrive, or take effect'),
  },
  {
    name: 'surface-as-verb',
    pattern: /\b(?:surface|surfaces|surfaced)\b/i,
    ...agentWording,
    message: both('when used as a verb, prefer report, show, return, or expose'),
  },
  {
    name: 'wiring-metaphor',
    pattern: /\b(?:wiring|wired)\b/i,
    ...agentWording,
    message: both('name the registration, connection, configuration, or call'),
  },
  {
    name: 'scaffold-metaphor',
    pattern: /\bscaffold(?:s|ed|ing)?\b/i,
    ...agentWording,
    message: both('consider template, generated starting code, or the concrete setup step'),
  },
  {
    name: 'threshold-metaphor',
    pattern: /\bfloor\b/i,
    ...agentWording,
    message: both('when describing a threshold, prefer minimum or lower bound'),
  },
  {
    name: 'agent-emphasis',
    pattern: /\b(?:decisive|genuinely|cleanly|honest (?:answer|caveat|take))\b/i,
    ...agentWording,
    message: both('remove the emphasis or state the exact result or limitation'),
  },
  {
    name: 'silent-behavior',
    pattern: /\bsilent(?:ly)?\b/i,
    ...agentWording,
    message: both('state which error, log, record, or notification is absent'),
  },
];

/** Offset and text of every match of `rule` in `text`. */
export function ruleMatches(rule: ProseRule, text: string): { index: number; term: string }[] {
  const pattern = new RegExp(rule.pattern.source, `${rule.pattern.flags}g`);
  return [...text.matchAll(pattern)].map((match) => ({ index: match.index, term: match[0] }));
}
