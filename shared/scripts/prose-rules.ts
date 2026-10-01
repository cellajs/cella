/**
 * Prose rules for source comments and authored Markdown. `required` rules fail `pnpm style`; `review` rules print
 * under `pnpm style:audit` only. Every rule reads source comments; `docs` rules also read Markdown and MDX prose.
 */
import type { Finding } from './repo-files.ts';

export interface ProseRule {
  name: string;
  pattern: RegExp;
  level: 'required' | 'review';
  message: string;
  docs?: boolean;
  /** Repo-relative paths the rule skips. */
  exclude?: RegExp;
}

/** Agent-associated wording, skipped in infra/ and in text that is generated or addresses app maintainers. */
const agentWording = { level: 'review', docs: true, exclude: /^(?:cella\/migrations\/|infra\/|sdk\/gen\/)/ } as const;

export const proseRules: ProseRule[] = [
  { name: 'em-dash', pattern: /—/, level: 'required', message: 'split the sentence, use a colon, or drop the clause', docs: true },
  {
    name: 'contrast-history',
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
    message: 'move evolution history to the commit or migration documentation',
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
    pattern: /\bmateriali[sz](?:e|ed|es|ing|ation|ations)\b/i,
    level: 'review',
    message: 'use a concrete verb unless this names the formal Yjs operation',
  },
  {
    name: 'load-bearing',
    pattern: /\bload(?:-| )bearing\b/i,
    ...agentWording,
    level: 'required',
    message: 'name the dependency, requirement, or failure consequence directly',
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
    pattern: /\b(?:surface|surfaces|surfaced)\b/i,
    ...agentWording,
    message: 'when used as a verb, prefer report, show, return, or expose',
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
