import * as pulumi from '@pulumi/pulumi'
import * as scaleway from '@pulumiverse/scaleway'
import { engineConfig } from '../config/engine-config'
const appConfig = engineConfig()
import { principalNames } from '../lib/scaleway/principals'
import { serviceNames } from '../lib/services'
import { vmSecretCondition } from '../lib/scaleway/vm-reader-secret'
import { naming, mode, organizationId, projectId, tags } from '../pulumi-context'

const names = principalNames(appConfig.slug, mode)

// The engine's IAM principals, resolved from IAM by name. Owned here because
// IAM is this module's concern; other resource modules (storage bucket
// policies, compute) import them from here.
//
// Per-mode names (`<slug>-<mode>-…`) are canonical; legacy names fall back so
// pre-migration stacks keep deploying. Resolution failures degrade per
// principal: required principals throw (a bucket policy without its CI
// statement would brick the deploy anyway), optional ones drop their
// statements with a warning instead of failing the whole deploy — a missing
// admin app must never block a production release (the 0.7.0 incident).

/** Resolve an application id by name, or undefined when the app is absent. */
function findApplicationId(name: string): pulumi.Output<string | undefined> {
  return pulumi.output(
    scaleway.iam
      .getApplication({ name, organizationId })
      .then((app) => app.applicationId || undefined)
      .catch(() => undefined),
  )
}

/** Resolve via the per-mode name first, then the legacy name (with a warning). */
function resolvePrincipalId(preferred: string, legacy: string): pulumi.Output<string | undefined> {
  return pulumi.all([findApplicationId(preferred), findApplicationId(legacy)]).apply(([modern, legacyId]) => {
    if (modern) return modern
    if (legacyId) {
      pulumi.log.warn(`IAM application '${preferred}' not found; using legacy '${legacy}'. Run the infra CLI "Migrate IAM model" to adopt per-mode principals.`)
      return legacyId
    }
    return undefined
  })
}

/** Require a principal: missing means the stack cannot function — fail with guidance. */
function requirePrincipalId(resolved: pulumi.Output<string | undefined>, label: string): pulumi.Output<string> {
  return resolved.apply((id) => {
    if (!id) throw new Error(`IAM application for ${label} not found — run the infra CLI bootstrap first.`)
    return id
  })
}

/** CI deploy application id: the principal CI authenticates as. Required. */
export const ciDeployApplicationId = requirePrincipalId(resolvePrincipalId(names.ciDeploy, names.legacy.ciDeploy), `CI deploy ('${names.ciDeploy}')`)

/** VM reader application id: the principal baked into service VMs. Required. */
export const vmReaderApplicationId = requirePrincipalId(resolvePrincipalId(names.vmReader, names.legacy.vmReader), `VM reader ('${names.vmReader}')`)

/**
 * Admin application id: the standing human principal (bucket access + infra
 * reads). OPTIONAL: when absent its bucket-policy statements are dropped with
 * a warning — never a deploy failure. Falls back to the legacy operator app,
 * then to the SCW_ADMIN_APPLICATION_ID / SCW_OPERATOR_APPLICATION_ID env vars
 * (local ups load backend/.env; CI does not carry these).
 */
export const adminApplicationId: pulumi.Output<string | undefined> = resolvePrincipalId(names.admin, names.legacy.operator).apply((id) => {
  const fromEnv = process.env.SCW_ADMIN_APPLICATION_ID?.trim() || process.env.SCW_OPERATOR_APPLICATION_ID?.trim() || undefined
  if (id) return id
  if (fromEnv) return fromEnv
  pulumi.log.warn(
    `Admin IAM application '${names.admin}' not found — admin bucket-policy statements are dropped this update. ` +
      'Run the infra CLI ("Rotate keys" or "Migrate IAM model") to create it; until then bucket access is CI-only.',
  )
  return undefined
})

/**
 * Build the project-scoped policy rules for the VM reader. Registry pull is
 * unconditioned; Secret Manager access carries a resource-level condition
 * restricting value reads to the service/shared folders (REQ-8) — engine
 * credentials (admin-key, vm-reader-key under /engine/) stay unreadable from
 * VMs. Conditions only narrow: `assert-vm-grants` additionally verifies no
 * OTHER (unconditioned) policy grants this app secret access, because one
 * such policy would silently un-scope this one (union semantics).
 */
function buildVmReaderPolicyRules(scopeProjectId: string): scaleway.types.input.iam.PolicyRule[] {
  return [
    {
      permissionSetNames: ['ContainerRegistryReadOnly'],
      projectIds: [scopeProjectId],
    },
    {
      permissionSetNames: ['SecretManagerReadOnly', 'SecretManagerSecretAccess'],
      projectIds: [scopeProjectId],
      condition: vmSecretCondition(naming.slug, mode, serviceNames),
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
