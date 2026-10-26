/** Secret Manager folder path for a stack (the env root), matching resources/secrets.ts. */
export function secretManagerPath(slug: string, mode: string): string {
  return `/${slug}-${mode}/`;
}

// The path hierarchy is the security boundary: IAM conditions grant secret-value reads by `resource.name.startsWith(<path>)`, so where a secret lives decides who reads it. Never rename a path in place.

/**
 * The folder of one service's secrets. A secret several services consume is stored once in each one's folder, so a service's grant names its
 * own folder and nothing else, and a change of consumers writes no IAM.
 */
function serviceSecretPath(slug: string, mode: string, service: string): string {
  return `/${slug}-${mode}/${service}/`;
}

/** One copy of a runtime secret: the consumer it serves and the folder it lives in. */
export interface SecretCopy {
  service: string;
  path: string;
}

/** Where the copies of a runtime secret live: one in the folder of each consumer. */
export function secretCopies(definition: { services: readonly string[] }, slug: string, mode: string): SecretCopy[] {
  return definition.services.map((service) => ({ service, path: serviceSecretPath(slug, mode, service) }));
}

/**
 * The folder a secret of several consumers lived in before each consumer had its own copy: one folder per consumer set, the consumers sorted
 * and nested. Read only to copy operator values out of it once (tasks/copy-shared-secrets.ts).
 */
export function legacySharedSecretPath(slug: string, mode: string, consumers: readonly string[]): string {
  return `/${slug}-${mode}/shared/${[...consumers].sort().join('/')}/`;
}

/** Folder of the values a deploy reads: the standing machine keys it hands over and the telemetry ingest key. Outside every machine's condition. */
export function deployFolderPath(slug: string, mode: string): string {
  return `/${slug}-${mode}/deploy/`;
}

/** Folder for engine-internal keys. Outside every machine's condition: a machine never reads the passphrase. */
export function engineSecretPath(slug: string, mode: string): string {
  return `/${slug}-${mode}/engine/`;
}

/** Folder for per-generation single-access handoff bundles of one service. */
export function handoffServicePath(slug: string, mode: string, service: string): string {
  return `/${slug}-${mode}/handoff/${service}/`;
}

/** Folder prefix covering every service's handoff bundles. */
export function handoffFolderPath(slug: string, mode: string): string {
  return `/${slug}-${mode}/handoff/`;
}

/**
 * Condition for one service application: value reads only under its own folder, leaving other services' secrets, engine keys and sibling
 * stacks unreadable. String equality matters: assert-grants compares the live rule condition against this exact output.
 */
export function serviceKeyCondition(slug: string, mode: string, service: string): string {
  return `resource.name.startsWith("${serviceSecretPath(slug, mode, service)}")`;
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
 * exactly what the terms joined in one rule grant, and each rule stays within what Scaleway accepts. A long slug or a host that carries
 * several services passes the budget of one rule. The Pulumi program and the grant assertion both split here, so they compare equal as strings.
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
      `A secret-read condition of ${condition.length} characters needs ${rules.length} rules, and one policy holds ${MAX_CONDITION_RULES}: shorten the slug or reduce the number of secret folders.`,
    );
  }
  return rules;
}

/** Condition for the boot application: only the handoff folder. The boot key is baked into cloud-init, so its reach is exactly the single-access bundles, and re-reading a consumed bundle fails as the tamper alarm. */
export function bootKeyCondition(slug: string, mode: string): string {
  return `resource.name.startsWith("${handoffFolderPath(slug, mode)}")`;
}
