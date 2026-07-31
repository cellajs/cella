import * as pulumi from '@pulumi/pulumi'
import * as scaleway from '@pulumiverse/scaleway'
import { engineConfig } from '../config/engine-config'
const appConfig = engineConfig()
import { principalNames } from '../lib/scaleway/principals'
import {
  BACKEND_S3_PERMISSION_SETS,
  BOOT_PROJECT_PERMISSION_SETS,
  SERVICE_SECRET_PERMISSION_SETS,
  VM_PROJECT_PERMISSION_SETS,
} from '../lib/scaleway/permissions'
import { deployedServices } from '../lib/services'
import { bootKeyCondition, serviceKeyCondition } from '../lib/scaleway/vm-reader-secret'
import { naming, mode, organizationId, projectId, tags } from '../pulumi-context'

const names = principalNames(appConfig.slug, mode)

/**
 * IAM model gate. `infra:iamModel = 'v2'` (set by a fresh bootstrap or the
 * "Migrate IAM model" CLI action) switches from the single vm-reader app to
 * per-service applications with per-deploy minted keys and single-access
 * handoff bundles. Absent = legacy model; every consumer of this module
 * branches on this ONE flag so a stack flips atomically with its config.
 */
export const iamModelV2 = new pulumi.Config('infra').get('iamModel') === 'v2'

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

/**
 * VM reader application id (legacy model). Required under legacy (its policy
 * and every VM depend on it); under v2 it is optional — kept resolvable so the
 * boot-diag bucket statement can retain it through a migration window.
 */
const vmReaderResolved = resolvePrincipalId(names.vmReader, names.legacy.vmReader)
export const vmReaderApplicationId: pulumi.Output<string | undefined> = iamModelV2
  ? vmReaderResolved
  : requirePrincipalId(vmReaderResolved, `VM reader ('${names.vmReader}')`)

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

// v2 principals: one application per deployed service + the boot fetcher.

const v2Services = iamModelV2 ? deployedServices(appConfig.services, appConfig.singleVM ?? false) : []

/** Per-service application ids (v2; empty map under legacy). Required when v2. */
export const serviceApplicationIds: Record<string, pulumi.Output<string>> = Object.fromEntries(
  v2Services.map((svc) => [svc.slug, requirePrincipalId(findApplicationId(names.vmService(svc.slug)), `service VM ('${names.vmService(svc.slug)}')`)]),
)

/** Boot fetcher application id (v2). Required when v2, undefined under legacy. */
export const bootApplicationId: pulumi.Output<string | undefined> = iamModelV2
  ? requirePrincipalId(findApplicationId(names.boot), `boot fetcher ('${names.boot}')`)
  : pulumi.output(undefined)

/**
 * Legacy `<slug>-s3` managed-key application (retired by REQ-20). Resolved so
 * bucket policies can keep admitting it through a migration window — a stack
 * whose backend still signs with the old s3 key must not lose uploads the
 * moment a policy lands on the private bucket. Migration deletes the app,
 * after which the statement drops out on the next up.
 */
export const legacyS3ApplicationId: pulumi.Output<string | undefined> = resolvePrincipalId(`${appConfig.slug}-${mode}-s3`, `${appConfig.slug}-s3`)

/**
 * Pulumi-managed IAM policies for the VM-side principals, reconciled on every
 * `pulumi up`. Bootstrap-owned: IAM policy write is forbidden to the CI key
 * (permission escalation), so a bootstrap-key up creates these before compute
 * exists. Compute VMs depend on them so a fresh bootstrap attaches grants
 * before the first runtime-secret hydration.
 *
 * Legacy: one vm-reader policy (registry pull + path-conditioned secret read,
 * see P2). v2: one policy per service app (secret read conditioned to its own
 * + shared folders; backend additionally granular S3 object sets) and one for
 * the boot app (registry pull + diag write + handoff-only secret read).
 * Conditions only narrow: `assert-vm-grants` verifies no other policy
 * un-scopes these (union semantics).
 *
 * @see resources/compute.ts
 */
export const vmIamPolicies: scaleway.iam.Policy[] = []

if (!iamModelV2) {
  vmIamPolicies.push(new scaleway.iam.Policy('vm-reader-policy', {
    name: naming.resource('vm-reader-policy'),
    description: 'Read-only registry + secret manager grant for service VMs (managed by Pulumi)',
    applicationId: vmReaderApplicationId.apply((id) => id ?? ''),
    // Set the org explicitly because the provider default org env may be absent
    // when only SCW_DEFAULT_PROJECT_ID is injected.
    organizationId,
    // Byte-identical to the pre-rewrite policy: one project-scoped rule, NO
    // resource condition. The vm-reader policy is bootstrap-owned (CI cannot
    // write IAM), so a legacy stack must see zero diff here or CI's `pulumi up`
    // 403s. Path-scoped secret reads are a v2-only feature (the per-service
    // policies below), applied via the migration's bootstrap `Apply infra
    // change` — never pushed onto a legacy stack by CI.
    rules: [
      {
        permissionSetNames: [...VM_PROJECT_PERMISSION_SETS],
        projectIds: [projectId],
      },
    ],
    tags,
  }, {
    // CI cannot write IAM policies (bootstrap-owned). Ignore BOTH rules and
    // description so a CI `pulumi up` never attempts an update it will 403 on:
    // rules are provisioned by a privileged bootstrap/migration `up`, and the
    // deploy's assert-vm-grants independently verifies the live grant (failing
    // loudly on real drift). Also sidesteps the provider's condition
    // empty-vs-unset diff asymmetry that would otherwise show a phantom ~rules.
    ignoreChanges: ['rules', 'description'],
  }))
} else {
  for (const svc of v2Services) {
    const isBackend = svc.s3Access === true
    vmIamPolicies.push(new scaleway.iam.Policy(`vm-${svc.slug}-policy`, {
      name: naming.resource(`vm-${svc.slug}-policy`),
      description: `Path-conditioned secret read${isBackend ? ' + S3 object access' : ''} for the ${svc.slug} service VMs (managed by Pulumi)`,
      applicationId: serviceApplicationIds[svc.slug],
      organizationId,
      rules: [
        {
          permissionSetNames: [...SERVICE_SECRET_PERMISSION_SETS],
          projectIds: [projectId],
          condition: serviceKeyCondition(naming.slug, mode, svc.slug),
        },
        ...(isBackend
          ? [{
              permissionSetNames: [...BACKEND_S3_PERMISSION_SETS],
              projectIds: [projectId],
            }]
          : []),
      ],
      tags,
    }, { ignoreChanges: ['rules', 'description'] }))
  }
  vmIamPolicies.push(new scaleway.iam.Policy('vm-boot-policy', {
    name: naming.resource('vm-boot-policy'),
    description: 'Registry pull + boot-diag write + handoff-only secret read for the boot fetcher (managed by Pulumi)',
    applicationId: bootApplicationId.apply((id) => id ?? ''),
    organizationId,
    rules: [
      {
        permissionSetNames: [...BOOT_PROJECT_PERMISSION_SETS],
        projectIds: [projectId],
      },
      {
        permissionSetNames: [...SERVICE_SECRET_PERMISSION_SETS],
        projectIds: [projectId],
        condition: bootKeyCondition(naming.slug, mode),
      },
    ],
    tags,
  }, { ignoreChanges: ['rules', 'description'] }))
}

/** Backend service app id when it exists (REQ-20 bucket statements); undefined otherwise. */
export const backendServiceApplicationId: pulumi.Output<string | undefined> =
  iamModelV2 && serviceApplicationIds.backend ? serviceApplicationIds.backend : pulumi.output(undefined)
