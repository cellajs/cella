/**
 * Create (or reuse) a scoped IAM application `<slug>-operator` with a policy
 * granting Object Storage access, so operator keys minted under it can read &
 * refresh the CI-scoped buckets (storage.ts OperatorAccess) without being the
 * CI deploy app. No key is minted here — the dev creates one in the console:
 * https://console.scaleway.com/iam/api-keys. The application id is what
 * SCW_OPERATOR_APPLICATION_ID points at.
 *
 * The shared provisioning flow lives in `lib/scaleway-iam.ts`; this file owns
 * only the operator-specific policy rules.
 */
import { provisionScopedKey, type ProvisionScopedKeyOptions, type ScopedKeyResult } from '../lib/scaleway-iam'

export type SetupOperatorAppOptions = ProvisionScopedKeyOptions
export type OperatorAppResult = ScopedKeyResult

export function setupOperatorApp(opts: SetupOperatorAppOptions): Promise<OperatorAppResult> {
  return provisionScopedKey(opts, {
    suffix: 'operator',
    appDescription: 'Human operator principal for infra CLI apply (bucket access)',
    policyDescription: 'Operator policy: Object Storage access for bucket refresh (auto-generated)',
    mintKey: false,
    buildRules: ({ projectId }) => [{ permission_set_names: ['ObjectStorageFullAccess'], project_ids: [projectId] }],
  })
}
