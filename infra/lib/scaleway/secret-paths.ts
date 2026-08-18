/** Secret Manager folder path for a stack (the env root), matching resources/secrets.ts. */
export function secretManagerPath(slug: string, mode: string): string {
  return `/${slug}-${mode}/`;
}

// The path hierarchy is the security boundary: IAM conditions grant secret-value reads by `resource.name.startsWith(<path>)`, so where a secret lives decides who reads it. Never rename a path in place.

/** Folder for secrets consumed by exactly one service. */
export function serviceSecretPath(slug: string, mode: string, service: string): string {
  return `/${slug}-${mode}/${service}/`;
}

/** Folder for secrets consumed by more than one service (DB URLs etc.). */
export function sharedSecretPath(slug: string, mode: string): string {
  return `/${slug}-${mode}/shared/`;
}

/** Folder for engine-internal credentials. Outside the VM condition on purpose: a VM must never read the admin key. */
export function engineSecretPath(slug: string, mode: string): string {
  return `/${slug}-${mode}/engine/`;
}

/** The folder a runtime secret lives in, from its consumer list. */
export function secretPathFor(definition: { services: readonly string[] }, slug: string, mode: string): string {
  return definition.services.length === 1
    ? serviceSecretPath(slug, mode, definition.services[0] as string)
    : sharedSecretPath(slug, mode);
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
 * Condition for one service application: value reads only under its own folders plus shared, leaving engine credentials and sibling stacks unreadable.
 * String equality matters: assert-vm-grants compares the live rule condition against this exact output. Pass the full secret scope from `secretScopeSlugs`, which for the singleVM host includes the folded services.
 */
export function serviceKeyCondition(slug: string, mode: string, services: string | readonly string[]): string {
  const scope = typeof services === 'string' ? [services] : services;
  return [...scope.map((service) => serviceSecretPath(slug, mode, service)), sharedSecretPath(slug, mode)]
    .map((path) => `resource.name.startsWith("${path}")`)
    .join(' || ');
}

/** Condition for the boot application: only the handoff folder. The boot key is baked into cloud-init, so its reach is exactly the single-access bundles, and re-reading a consumed bundle fails as the tamper alarm. */
export function bootKeyCondition(slug: string, mode: string): string {
  return `resource.name.startsWith("${handoffFolderPath(slug, mode)}")`;
}
