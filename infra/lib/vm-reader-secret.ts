/**
 * Shared coordinates for the VM reader key in Scaleway Secret Manager.
 *
 * The `<slug>-vm-reader` IAM key pair (registry pull + Secret Manager access)
 * used to live encrypted in `Pulumi.<env>.yaml`. It now lives in
 * Secret Manager instead (SOVRUN §3.3, "materialized, not stored"): the infra
 * CLI seeds it at bootstrap and the Pulumi program reads it back at `pulumi up`
 * time to bake into VM cloud-init. This module is the single source of truth for
 * the container name + path so the writer (CLI) and reader (helpers.ts) agree.
 *
 * Pure (no Pulumi/SDK imports) so both the runtime program and standalone CLI
 * tasks can import it.
 */

/** Secret Manager container name for the VM reader key pair (kebab-case). */
export const VM_READER_SECRET_NAME = 'vm-reader-key'

/** Secret Manager folder path for a stack, matching resources/secrets.ts. */
export function secretManagerPath(slug: string, mode: string): string {
  return `/${slug}-${mode}/`
}

/** Shape of the JSON payload stored in the VM reader key secret version. */
export interface VmReaderKeyPayload {
  accessKey: string
  secretKey: string
}
