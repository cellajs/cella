import * as scaleway from '@pulumiverse/scaleway'
import { VM_PROJECT_PERMISSION_SETS } from '../lib/scaleway/permissions'
import { naming, organizationId, projectId, tags, vmReaderApplicationId, provisionFoundation } from '../pulumi-context'

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
 * every `pulumi up`.
 *
 * Compute VMs depend on this so that on a fresh bootstrap the grant is attached
 * before the VMs boot and run their first runtime-secret hydration.
 *
 * Bootstrap-owned: IAM policy write is forbidden to the CI key (permission
 * escalation), so a bootstrap-key up creates this before compute exists.
 *
 * @see resources/compute.ts
 */
export const vmReaderPolicy = provisionFoundation
  ? new scaleway.iam.Policy('vm-reader-policy', {
    name: naming.resource('vm-reader-policy'),
    description: 'Read-only registry + secret manager grant for service VMs (managed by Pulumi)',
    // The non-human VM reader principal created by bootstrap, resolved from IAM by name.
    applicationId: vmReaderApplicationId,
    // Set the org explicitly because the provider default org env may be absent
    // when only SCW_DEFAULT_PROJECT_ID is injected.
    organizationId,
    rules: buildVmReaderPolicyRules(projectId),
    tags,
  }, {
    // CI intentionally cannot write IAM policies. Keep permission rules managed,
    // but do not let cosmetic provider/API description drift block deployments.
    ignoreChanges: ['description'],
  })
  // Generations stacks never manage IAM: the foundation stack owns the grant,
  // which exists before any generation VM is provisioned.
  : undefined
