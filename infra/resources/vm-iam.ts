/**
 * VM reader IAM policy — Pulumi-managed grant for the `<slug>-vm-reader`
 * application that every service VM authenticates as.
 *
 * Why this lives in Pulumi (and not only in the bootstrap task):
 *   The VM reader's permission sets used to be applied ONLY by the local
 *   `tasks/setup-vm-key.ts` bootstrap/rotate task. That task runs on an
 *   operator's laptop, never in CI, so once the live policy drifted from the
 *   code (e.g. missing `SecretManagerSecretAccess`) nothing converged it back —
 *   and a VM replacement then baked a key that 403'd on every runtime secret,
 *   crash-looping the backend behind a 502 with no automatic recovery.
 *
 *   Declaring the policy here makes `pulumi up` (which every deploy runs)
 *   reconcile the permission sets on every deploy. The grant can no longer
 *   drift: if someone removes a permission set out-of-band, the next deploy
 *   puts it back. `tasks/setup-vm-key.ts` now provisions only the application +
 *   API key (`managePolicy: false`) so there is a single source of truth.
 *
 * The application id is resolved from the Scaleway IAM API by name
 * (`<slug>-vm-reader`, SOVRUN §3.3) rather than read from stack config; we
 * attach this policy to it. The permission set list is the canonical
 * `VM_PROJECT_PERMISSION_SETS` (defined in `lib/permissions.ts`, locked by
 * `tasks/permission-sets.test.ts`).
 */
import * as scaleway from '@pulumiverse/scaleway'
import { VM_PROJECT_PERMISSION_SETS } from '../lib/permissions'
import { naming, organizationId, projectId, tags, vmReaderApplicationId } from '../pulumi-context'

// Application the policy binds to — the non-human VM reader principal created by
// bootstrap. Derived from IAM by name (SOVRUN §3.3), was the stored
// `infra:vmApplicationId`: without it the VMs have no IAM identity to grant,
// which is the exact failure this module exists to prevent.
const vmApplicationId = vmReaderApplicationId

/**
 * Build the single project-scoped policy rule for the VM reader.
 *
 * Pure + exported so the rule shape (permission sets + project scoping) is
 * unit-testable without a Pulumi runtime.
 */
export function buildVmReaderPolicyRules(scopeProjectId: string): scaleway.types.input.iam.PolicyRule[] {
  return [
    {
      permissionSetNames: [...VM_PROJECT_PERMISSION_SETS],
      projectIds: [scopeProjectId],
    },
  ]
}

/**
 * Pulumi-managed IAM policy granting the VM reader application its read-only
 * registry + object-storage + secret-manager permission sets. Reconciled on
 * every `pulumi up`, so the grant is drift-proof.
 *
 * Compute VMs depend on this (see `resources/compute.ts`) so that on a fresh
 * bootstrap the grant is attached before the VMs boot and run their first
 * runtime-secret hydration.
 */
export const vmReaderPolicy = new scaleway.iam.Policy('vm-reader-policy', {
  name: naming.resource('vm-reader-policy'),
  description: 'Read-only registry + secret manager grant for service VMs (managed by Pulumi)',
  applicationId: vmApplicationId,
  // Set the org explicitly (resolved in pulumi-context from env, else the project) so
  // the create does not depend on the provider's default org env — the bootstrap
  // "Apply infra change" flow injects SCW_DEFAULT_PROJECT_ID but no org id, which
  // left the provider default empty and failed with "organization_id is wrongly
  // formatted". CI already sets SCW_DEFAULT_ORGANIZATION_ID; this makes both paths
  // converge on the same resolved org.
  organizationId,
  rules: buildVmReaderPolicyRules(projectId),
  tags,
}, {
  // CI intentionally cannot write IAM policies. Keep permission rules managed,
  // but do not let cosmetic provider/API description drift block deployments.
  ignoreChanges: ['description'],
})
