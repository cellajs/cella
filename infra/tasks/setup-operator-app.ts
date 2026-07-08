import { provisionScopedKey, type ProvisionScopedKeyOptions, type ScopedKeyResult } from '../lib/scaleway/scaleway-iam'

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
