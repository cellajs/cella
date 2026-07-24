import * as scaleway from '@pulumiverse/scaleway'
import { engineConfig } from '../config/engine-config'
const appConfig = engineConfig()
import { VM_PROJECT_PERMISSION_SETS } from '../lib/scaleway/permissions'
import { naming, organizationId, projectId, tags } from '../pulumi-context'

// The two non-human IAM principals bootstrap creates, resolved from IAM by
// name. Owned here because IAM is this module's concern; other resource
// modules (storage bucket policies, compute) import them from here.

/** CI deploy application id: the `<slug>-ci-deploy` principal CI authenticates as. */
export const ciDeployApplicationId = scaleway.iam
  .getApplicationOutput({ name: `${appConfig.slug}-ci-deploy`, organizationId })
  .apply((app) => {
    if (!app.applicationId) throw new Error(`IAM application '${appConfig.slug}-ci-deploy' not found — run the infra CLI bootstrap first.`)
    return app.applicationId
  })

/** VM reader application id: the `<slug>-vm-reader` principal baked into service VMs. */
export const vmReaderApplicationId = scaleway.iam
  .getApplicationOutput({ name: `${appConfig.slug}-vm-reader`, organizationId })
  .apply((app) => {
    if (!app.applicationId) throw new Error(`IAM application '${appConfig.slug}-vm-reader' not found — run the infra CLI bootstrap first.`)
    return app.applicationId
  })

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
export const vmReaderPolicy = new scaleway.iam.Policy('vm-reader-policy', {
  name: naming.resource('vm-reader-policy'),
  description: 'Read-only registry + secret manager grant for service VMs (managed by Pulumi)',
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
