/** Secret Manager folder path for a stack (the env root), matching resources/secrets.ts. */
export function secretManagerPath(slug: string, mode: string): string {
  return `/${slug}-${mode}/`;
}

// Per-service path layout (REQ-8). The path hierarchy is the SECURITY BOUNDARY: IAM
// conditions grant secret-value reads by `resource.name.startsWith(<path>)`, so where a
// secret lives decides who reads it; the engine owns all naming and never renames in place.

/** Folder for secrets consumed by exactly one service. */
export function serviceSecretPath(slug: string, mode: string, service: string): string {
  return `/${slug}-${mode}/${service}/`;
}

/** Folder for secrets consumed by more than one service (DB URLs etc.). */
export function sharedSecretPath(slug: string, mode: string): string {
  return `/${slug}-${mode}/shared/`;
}

/**
 * Folder for engine-internal credentials (admin-key). OUTSIDE the VM
 * condition on purpose: a VM must never be able to read the admin key.
 */
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
 * Condition for one service application: value reads only under its own
 * folder(s) + shared. Engine credentials and any future sibling stacks in the
 * same project stay unreadable. STRING EQUALITY MATTERS: assert-vm-grants
 * compares the live rule condition against this exact builder output, so
 * producer and checker must share it. No `!has(resource.id)` escape:
 * hydration GETs by id only, so list actions may (and should) stay denied.
 * Pass the full secret scope (lib/services.ts secretScopeSlugs); for the
 * singleVM host that includes the folded co-hosted/collocated services, whose
 * secrets hydrate on the host VM.
 */
export function serviceKeyCondition(slug: string, mode: string, services: string | readonly string[]): string {
  const scope = typeof services === 'string' ? [services] : services;
  return [...scope.map((service) => serviceSecretPath(slug, mode, service)), sharedSecretPath(slug, mode)]
    .map((path) => `resource.name.startsWith("${path}")`)
    .join(' || ');
}

/**
 * Condition for the boot application: ONLY the handoff folder. The boot key is
 * baked into cloud-init, so its secret reach must be exactly the single-access
 * bundles: reading one that a VM already consumed fails, which IS the tamper
 * alarm.
 */
export function bootKeyCondition(slug: string, mode: string): string {
  return `resource.name.startsWith("${handoffFolderPath(slug, mode)}")`;
}
