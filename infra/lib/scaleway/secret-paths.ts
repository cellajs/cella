/** Secret Manager folder path for a stack (the env root), matching resources/secrets.ts. */
export function secretManagerPath(slug: string, mode: string): string {
  return `/${slug}-${mode}/`;
}

// The path hierarchy is the security boundary: IAM conditions grant secret-value reads by `resource.name.startsWith(<path>)`, so where a secret lives decides who reads it. Never rename a path in place.

/** Folder for secrets consumed by exactly one service. */
function serviceSecretPath(slug: string, mode: string, service: string): string {
  return `/${slug}-${mode}/${service}/`;
}

/**
 * Folder for secrets consumed by more than one service: one folder per consumer set, the consumers sorted and nested
 * (`/shared/backend/mcp/`), so a grant on it reaches exactly the secrets that set consumes. A folder that prefixes
 * another belongs to a subset of its consumers, so a `startsWith` grant never reaches a secret outside its set.
 */
function sharedSecretPath(slug: string, mode: string, consumers: readonly string[]): string {
  return `/${slug}-${mode}/shared/${[...consumers].sort().join('/')}/`;
}

/** Folder for engine-internal keys. Outside the VM condition on purpose: a VM must never read the admin key. */
export function engineSecretPath(slug: string, mode: string): string {
  return `/${slug}-${mode}/engine/`;
}

/** The folder a runtime secret lives in, from its consumer list. */
export function secretPathFor(definition: { services: readonly string[] }, slug: string, mode: string): string {
  return definition.services.length === 1
    ? serviceSecretPath(slug, mode, definition.services[0] as string)
    : sharedSecretPath(slug, mode, definition.services);
}

// P3 (per-service model): handoff folders + per-principal conditions.

/** Folder for per-generation single-access handoff bundles of one service. */
export function handoffServicePath(slug: string, mode: string, service: string): string {
  return `/${slug}-${mode}/handoff/${service}/`;
}

/** Folder prefix covering every service's handoff bundles. */
export function handoffFolderPath(slug: string, mode: string): string {
  return `/${slug}-${mode}/handoff/`;
}

/**
 * Condition for one service application: value reads only under its own folders plus the shared folder of every
 * consumer set its scope belongs to, leaving other sets' secrets, engine keys and sibling stacks unreadable.
 * String equality matters: assert-vm-grants compares the live rule condition against this exact output. Pass the full secret scope from `secretScopeSlugs`, which for the singleVM host includes the folded services, and the consumer list of every runtime secret.
 */
export function serviceKeyCondition(
  slug: string,
  mode: string,
  services: string | readonly string[],
  consumerSets: readonly (readonly string[])[],
): string {
  const scope = typeof services === 'string' ? [services] : services;
  const sharedPaths = [
    ...new Set(
      consumerSets
        .filter((consumers) => consumers.length > 1 && consumers.some((service) => scope.includes(service)))
        .map((consumers) => sharedSecretPath(slug, mode, consumers)),
    ),
  ].sort();
  // A folder under another granted folder is covered by it already.
  const grantedShared = sharedPaths.filter((path) => !sharedPaths.some((other) => other !== path && path.startsWith(other)));
  return [...scope.map((service) => serviceSecretPath(slug, mode, service)), ...grantedShared]
    .map((path) => `resource.name.startsWith("${path}")`)
    .join(' || ');
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
