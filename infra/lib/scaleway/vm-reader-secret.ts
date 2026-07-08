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
