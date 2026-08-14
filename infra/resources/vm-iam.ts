import * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { engineConfig } from '../config/engine-config';

const appConfig = engineConfig();

import {
  BACKEND_S3_PERMISSION_SETS,
  BOOT_PROJECT_PERMISSION_SETS,
  SERVICE_SECRET_PERMISSION_SETS,
} from '../lib/scaleway/permissions';
import { principalNames } from '../lib/scaleway/principals';
import { bootKeyCondition, serviceKeyCondition } from '../lib/scaleway/secret-paths';
import { deployedServices, secretScopeSlugs } from '../lib/services';
import { mode, naming, organizationId, projectId, tags } from '../pulumi-context';

const names = principalNames(appConfig.slug, mode);

// The engine's IAM principals, resolved from IAM by name and owned here because IAM is this
// module's concern (storage bucket policies and compute import them). Per-mode names
// (`<slug>-<mode>-…`) are canonical. Required principals throw on a resolution failure; optional ones (e.g. the admin app) only warn and drop their statements, so a missing admin app never blocks a production release (the 0.7.0 incident).

/** Resolve an application id by name, or undefined when the app is absent. */
function findApplicationId(name: string): pulumi.Output<string | undefined> {
  return pulumi.output(
    scaleway.iam
      .getApplication({ name, organizationId })
      .then((app) => app.applicationId || undefined)
      .catch((error: unknown) => {
        // Only a genuine not-found means "absent" (optional statements drop,
        // required principals fail with guidance). A transient IAM outage must
        // not silently demote a required principal to "not found" or drop
        // admin statements: rethrow anything else.
        const message = error instanceof Error ? error.message : String(error);
        if (/not.?found|404|does not exist/i.test(message)) return undefined;
        throw error;
      }),
  );
}

/** Require a principal: missing means the stack cannot function, so fail with guidance. */
function requirePrincipalId(resolved: pulumi.Output<string | undefined>, label: string): pulumi.Output<string> {
  return resolved.apply((id) => {
    if (!id) throw new Error(`IAM application for ${label} not found — run the infra CLI bootstrap first.`);
    return id;
  });
}

/** CI deploy application id: the principal CI authenticates as. Required. */
export const ciDeployApplicationId = requirePrincipalId(
  findApplicationId(names.ciDeploy),
  `CI deploy ('${names.ciDeploy}')`,
);

/**
 * Admin application id: the standing human principal (bucket access + infra
 * reads). OPTIONAL: when absent its bucket-policy statements are dropped with
 * a warning, never a deploy failure. Falls back to the SCW_ADMIN_APPLICATION_ID
 * env var (local ups load backend/.env; CI does not carry it).
 */
export const adminApplicationId: pulumi.Output<string | undefined> = findApplicationId(names.admin).apply((id) => {
  const fromEnv = process.env.SCW_ADMIN_APPLICATION_ID?.trim() || undefined;
  if (id) return id;
  if (fromEnv) return fromEnv;
  pulumi.log.warn(
    `Admin IAM application '${names.admin}' not found — admin bucket-policy statements are dropped this update. ` +
      'Run the infra CLI ("Rotate keys") to create it; until then bucket access is CI-only.',
  );
  return undefined;
});

// VM-side principals: one application per deployed service + the boot fetcher.

const vmServices = deployedServices(appConfig.services, appConfig.singleVM ?? false);

/** Per-service application ids. Required. */
export const serviceApplicationIds: Record<string, pulumi.Output<string>> = Object.fromEntries(
  vmServices.map((svc) => [
    svc.slug,
    requirePrincipalId(findApplicationId(names.vmService(svc.slug)), `service VM ('${names.vmService(svc.slug)}')`),
  ]),
);

/** Boot fetcher application id. Required. */
export const bootApplicationId: pulumi.Output<string> = requirePrincipalId(
  findApplicationId(names.boot),
  `boot fetcher ('${names.boot}')`,
);

/**
 * Pulumi-managed IAM policies for the VM-side principals, reconciled on every
 * `pulumi up`. Bootstrap-owned: IAM policy write is forbidden to the CI key
 * (permission escalation), so a bootstrap-key up creates these before compute
 * exists. Compute VMs depend on them so a fresh bootstrap attaches grants
 * before the first runtime-secret hydration.
 *
 * One policy per service app (secret read conditioned to its own + shared
 * folders; backend additionally granular S3 object sets) and one for the boot
 * app (registry pull + diag write + handoff-only secret read). Conditions only
 * narrow: `assert-vm-grants` verifies no other policy un-scopes these (union
 * semantics).
 *
 * The `ignoreChanges: ['rules', 'description']` opts keep CI ups from
 * attempting IAM writes they would 403 on: rules are provisioned by a
 * privileged bootstrap `up`, and the deploy's assert-vm-grants independently
 * verifies the live grant (failing loudly on real drift). Also sidesteps the
 * provider's condition empty-vs-unset diff asymmetry that would otherwise show
 * a phantom ~rules.
 *
 * @see resources/compute.ts
 */
export const vmIamPolicies: scaleway.iam.Policy[] = [];

for (const svc of vmServices) {
  const isBackend = svc.s3Access === true;
  vmIamPolicies.push(
    new scaleway.iam.Policy(
      `vm-${svc.slug}-policy`,
      {
        name: naming.resource(`vm-${svc.slug}-policy`),
        description: `Path-conditioned secret read${isBackend ? ' + S3 object access' : ''} for the ${svc.slug} service VMs (managed by Pulumi)`,
        applicationId: serviceApplicationIds[svc.slug],
        organizationId,
        rules: [
          {
            permissionSetNames: [...SERVICE_SECRET_PERMISSION_SETS],
            projectIds: [projectId],
            condition: serviceKeyCondition(
              naming.slug,
              mode,
              secretScopeSlugs(appConfig.services, appConfig.singleVM ?? false, svc.slug),
            ),
          },
          ...(isBackend
            ? [
                {
                  permissionSetNames: [...BACKEND_S3_PERMISSION_SETS],
                  projectIds: [projectId],
                },
              ]
            : []),
        ],
        tags,
      },
      { ignoreChanges: ['rules', 'description'] },
    ),
  );
}
vmIamPolicies.push(
  new scaleway.iam.Policy(
    'vm-boot-policy',
    {
      name: naming.resource('vm-boot-policy'),
      description:
        'Registry pull + boot-diag write + handoff-only secret read for the boot fetcher (managed by Pulumi)',
      applicationId: bootApplicationId,
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
    },
    { ignoreChanges: ['rules', 'description'] },
  ),
);

/** Backend service app id when the backend service is deployed (REQ-20 bucket statements); undefined otherwise. */
export const backendServiceApplicationId: pulumi.Output<string | undefined> =
  serviceApplicationIds.backend ?? pulumi.output(undefined);
