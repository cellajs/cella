// The path hierarchy is the security boundary: IAM conditions grant secret-value reads by `resource.name.startsWith(<path>)`, so where a secret
// lives decides who reads it. Every environment has a Scaleway project of its own, and each rule names that project, so the folders start at
// the project's root. A path that changes moves its secrets in the same release as the conditions that name it (tasks/move-secret-paths.ts).

/**
 * The folder of one service's secrets. A secret several services consume is stored once in each one's folder, so a service's grant names its
 * own folder and nothing else, and a change of consumers writes no IAM.
 */
function serviceSecretPath(service: string): string {
  return `/${service}/`;
}

/** One copy of a runtime secret: the consumer it serves and the folder it lives in. */
export interface SecretCopy {
  service: string;
  path: string;
}

/** Where the copies of a runtime secret live: one in the folder of each consumer. */
export function secretCopies(definition: { services: readonly string[] }): SecretCopy[] {
  return definition.services.map((service) => ({ service, path: serviceSecretPath(service) }));
}

/**
 * The folder a secret of several consumers lived in before each consumer had its own copy: one folder per consumer set, the consumers sorted
 * and nested. Read only to copy operator values out of it once (tasks/copy-shared-secrets.ts).
 */
export function legacySharedSecretPath(consumers: readonly string[]): string {
  return `/shared/${[...consumers].sort().join('/')}/`;
}

/** Folder of the values a deploy reads: the standing machine keys it writes into each new machine's cloud-init and the telemetry ingest key. Outside every machine's condition. */
export const DEPLOY_FOLDER = '/deploy/';

/** Folder for engine-internal keys. Outside every machine's condition: a machine never reads the passphrase. */
export const ENGINE_FOLDER = '/engine/';

/**
 * Condition for one service application: value reads only under its own folder, leaving other services' secrets and engine keys unreadable.
 * String equality matters: the identity plan compares the live rule condition with this exact output.
 */
export function serviceKeyCondition(service: string): string {
  return `resource.name.startsWith("${serviceSecretPath(service)}")`;
}

/**
 * Characters the condition of one rule may hold. Scaleway refuses a larger one as "condition is too complex": it accepts every condition up to
 * about 600 characters and refuses from about 630, and the tipping point moves a little with the number of terms.
 */
const RULE_CONDITION_BUDGET = 500;

/** Rules one policy may hold for its condition: Scaleway's quota is ten rules a policy, and a policy keeps one for its unconditioned rights. */
const MAX_CONDITION_RULES = 9;

/**
 * The conditions of the rules that together grant one `||` condition. The rules of a policy add up, so terms spread over several rules grant
 * exactly what the terms joined in one rule grant, and each rule stays within what Scaleway accepts. A host that carries several services
 * passes the budget of one rule. The machine policies split here, so the identity plan compares them with the live rules as strings.
 */
export function ruleConditions(condition: string): string[] {
  const rules: string[] = [];
  for (const term of condition.split(' || ')) {
    const last = rules.at(-1);
    if (last !== undefined && last.length + ' || '.length + term.length <= RULE_CONDITION_BUDGET) rules[rules.length - 1] = `${last} || ${term}`;
    else rules.push(term);
  }
  if (rules.length > MAX_CONDITION_RULES) {
    throw new Error(
      `A secret-read condition of ${condition.length} characters needs ${rules.length} rules, and one policy holds ${MAX_CONDITION_RULES}: reduce the number of secret folders.`,
    );
  }
  return rules;
}
