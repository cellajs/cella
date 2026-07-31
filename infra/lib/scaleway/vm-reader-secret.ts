/** Secret Manager container name for the VM reader key pair (kebab-case). */
export const VM_READER_SECRET_NAME = 'vm-reader-key'

/** Secret Manager folder path for a stack (the env root), matching resources/secrets.ts. */
export function secretManagerPath(slug: string, mode: string): string {
  return `/${slug}-${mode}/`
}

// Per-service path layout (REQ-8). The path hierarchy is the SECURITY BOUNDARY:
// IAM resource-level conditions grant secret-value reads by
// `resource.name.startsWith(<path>)`, so where a secret lives decides who can
// read it. Renames move secrets across the boundary — the engine owns all
// naming and never renames in place (create + delete instead).

/** Folder for secrets consumed by exactly one service. */
export function serviceSecretPath(slug: string, mode: string, service: string): string {
  return `/${slug}-${mode}/${service}/`
}

/** Folder for secrets consumed by more than one service (DB URLs etc.). */
export function sharedSecretPath(slug: string, mode: string): string {
  return `/${slug}-${mode}/shared/`
}

/**
 * Folder for engine-internal credentials (vm-reader-key, admin-key). OUTSIDE
 * the VM condition on purpose: a VM must never be able to read the admin key
 * or its own key container.
 */
export function engineSecretPath(slug: string, mode: string): string {
  return `/${slug}-${mode}/engine/`
}

/** The folder a runtime secret lives in, from its consumer list. */
export function secretPathFor(definition: { services: readonly string[] }, slug: string, mode: string): string {
  return definition.services.length === 1
    ? serviceSecretPath(slug, mode, definition.services[0] as string)
    : sharedSecretPath(slug, mode)
}

/**
 * CEL condition string for the VM reader's Secret Manager grant: value reads
 * only under the service and shared folders — engine credentials and any
 * future sibling stacks in the same project stay unreadable. STRING EQUALITY
 * MATTERS: assert-vm-grants compares the live rule condition against this
 * exact builder output, so producer and checker must share it. No
 * `!has(resource.id)` escape: hydration GETs by id only, so list actions may
 * (and should) stay denied.
 */
export function vmSecretCondition(slug: string, mode: string, serviceNames: readonly string[]): string {
  const paths = [...serviceNames.map((service) => serviceSecretPath(slug, mode, service)), sharedSecretPath(slug, mode)]
  return paths.map((path) => `resource.name.startsWith("${path}")`).join(' || ')
}

// P3 (per-service model): handoff folders + per-principal conditions.

/** Folder for per-generation single-access handoff bundles of one service. */
export function handoffServicePath(slug: string, mode: string, service: string): string {
  return `/${slug}-${mode}/handoff/${service}/`
}

/** Folder prefix covering every service's handoff bundles. */
export function handoffFolderPath(slug: string, mode: string): string {
  return `/${slug}-${mode}/handoff/`
}

/**
 * Condition for ONE service application: its own folder + shared. Narrower
 * than {@link vmSecretCondition} (the single-app P2 grant), which unions all
 * services.
 */
export function serviceKeyCondition(slug: string, mode: string, service: string): string {
  return [serviceSecretPath(slug, mode, service), sharedSecretPath(slug, mode)]
    .map((path) => `resource.name.startsWith("${path}")`)
    .join(' || ')
}

/**
 * Condition for the boot application: ONLY the handoff folder. The boot key is
 * baked into cloud-init, so its secret reach must be exactly the single-access
 * bundles — reading one that a VM already consumed fails, which IS the tamper
 * alarm.
 */
export function bootKeyCondition(slug: string, mode: string): string {
  return `resource.name.startsWith("${handoffFolderPath(slug, mode)}")`
}

/** Shape of the JSON payload stored in the VM reader key secret version. */
export interface VmReaderKeyPayload {
  accessKey: string
  secretKey: string
}
