/** One agent-associated prose pattern and its concrete rewrite guidance. */
export interface AgentVocabularyRule {
  name: string;
  pattern: RegExp;
  message: string;
}

/** Agent-associated wording that is too metaphorical to accept in authored prose. */
export const requiredAgentVocabularyRules: AgentVocabularyRule[] = [
  {
    name: 'load-bearing',
    pattern: /\bload(?:-| )bearing\b/i,
    message: 'name the dependency, requirement, or failure consequence directly',
  },
];

/** Context-dependent wording that merits review but may be technically exact. */
export const reviewAgentVocabularyRules: AgentVocabularyRule[] = [
  {
    name: 'boundary-metaphor',
    pattern: /\bseams?\b/i,
    message: 'consider boundary, interface, integration point, or the named call site',
  },
  {
    name: 'delivery-metaphor',
    pattern: /\b(?:land|lands|landed)\b/i,
    message: 'consider merge, deploy, store, arrive, or take effect',
  },
  {
    name: 'surface-as-verb',
    pattern: /\b(?:surface|surfaces|surfaced)\b/i,
    message: 'when used as a verb, prefer report, show, return, or expose',
  },
  {
    name: 'wiring-metaphor',
    pattern: /\b(?:wiring|wired)\b/i,
    message: 'name the registration, connection, configuration, or call',
  },
  {
    name: 'scaffold-metaphor',
    pattern: /\bscaffold(?:s|ed|ing)?\b/i,
    message: 'consider template, generated starting code, or the concrete setup step',
  },
  {
    name: 'threshold-metaphor',
    pattern: /\bfloor\b/i,
    message: 'when describing a threshold, prefer minimum or lower bound',
  },
  {
    name: 'agent-emphasis',
    pattern: /\b(?:decisive|genuinely|cleanly|honest (?:answer|caveat|take))\b/i,
    message: 'remove the emphasis or state the exact result or limitation',
  },
  {
    name: 'silent-behavior',
    pattern: /\bsilent(?:ly)?\b/i,
    message: 'state which error, log, record, or notification is absent',
  },
];
