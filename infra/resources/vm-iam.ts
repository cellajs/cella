/**
 * VM reader IAM policy — Pulumi-managed grant for the `<slug>-vm-reader`
 * application that every service VM authenticates as.
 *
 * Pulumi owns this policy so every deploy reconciles the permission sets.
 * The bootstrap task only creates the application and API key.
 *
 * The application id is resolved from the Scaleway IAM API by name, and the
 * policy uses the canonical `VM_PROJECT_PERMISSION_SETS` list.
 */
import * as scaleway from '@pulumiverse/scaleway'
import { VM_PROJECT_PERMISSION_SETS } from '../lib/scaleway/permissions'
import { naming, organizationId, projectId, tags, vmReaderApplicationId } from '../pulumi-context'

/** Build the single project-scoped policy rule for the VM reader. */
function buildVmReaderPolicyRules(scopeProjectId: string): scaleway.types.input.iam.PolicyRule[] {
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
  // The non-human VM reader principal created by bootstrap, resolved from IAM by name.
  applicationId: vmReaderApplicationId,
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
