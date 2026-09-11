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
import { principalSecretScopeSlugs, principalServices } from '../lib/services';
import { vmPolicyIgnoreChanges } from '../lib/stack/privileged-up';
import { mode, naming, organizationId, projectId, tags } from '../pulumi-context';

const names = principalNames(appConfig.slug, mode);

// The engine's IAM principals, resolved by their canonical per-mode names. A required principal throws on a resolution failure; an optional one warns and drops its statements, so a missing admin app never blocks a release.

/** Resolve an application id by name, or undefined when the app is absent. */
function findApplicationId(name: string): pulumi.Output<string | undefined> {
  return pulumi.output(
    scaleway.iam
      .getApplication({ name, organizationId })
      .then((app) => app.applicationId || undefined)
      .catch((error: unknown) => {
        // Only a real not-found counts as absent: a transient IAM outage must not demote a required principal or drop admin statements, so rethrow anything else.
        const message = error instanceof Error ? error.message : String(error);
        if (/not.?found|404|does not exist/i.test(message)) return undefined;
        throw error;
      }),
  );
}

/** Require a principal: missing means the stack cannot function, so fail with guidance. */
function requirePrincipalId(resolved: pulumi.Output<string | undefined>, label: string): pulumi.Output<string> {
  return resolved.apply((id) => {
    if (!id)
      throw new Error(
        `IAM application for ${label} not found: run the infra CLI bootstrap first, or "Apply infra change" after a registry change.`,
      );
    return id;
  });
}

/** CI deploy application id: the principal CI authenticates as. Required. */
export const ciDeployApplicationId = requirePrincipalId(
  findApplicationId(names.ciDeploy),
  `CI deploy ('${names.ciDeploy}')`,
);

/** Admin application id, the standing human principal. Optional: when absent its bucket-policy statements are dropped with a warning. */
export const adminApplicationId: pulumi.Output<string | undefined> = findApplicationId(names.admin).apply((id) => {
  if (id) return id;
  pulumi.log.warn(
    `Admin IAM application '${names.admin}' not found: admin bucket-policy statements are dropped this update. ` +
      'Run the infra CLI ("Rotate keys") to create it; until then bucket access is CI-only.',
  );
  return undefined;
});

// VM-side principals: one application per registry service that owns VMs, plus the boot fetcher. Registry-derived: an `enabled` toggle changes compute, never a principal.

const singleVM = appConfig.singleVM ?? false;
const vmServices = principalServices(singleVM);

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
 * Pulumi-managed IAM policies for the VM-side principals. Bootstrap-owned: IAM policy write is forbidden to the CI key, so a bootstrap-key up creates these before compute exists, and compute VMs depend on them so grants attach before the first runtime-secret hydration.
 * One policy per service app (secret read conditioned to its own and shared folders) and one for the boot app (registry pull, diag write, handoff-only secret read). Conditions only narrow, and `assert-vm-grants` verifies no other policy un-scopes them.
 * Principals and conditions follow the service registry, not the enabled set: a service toggle changes compute only, while a registry change or a `singleVM` flip needs a privileged up.
 * CI ups ignore `rules` (they would 403 on the IAM write, and the provider shows a phantom ~rules from its condition empty-vs-unset asymmetry); a privileged up (CLI "Apply infra change") reconciles them, which is how a changed secret scope reaches the live policy.
 * @see resources/compute.ts
 * @see lib/stack/privileged-up.ts
 */
export const vmIamPolicies: scaleway.iam.Policy[] = [];
const policyOptions = { ignoreChanges: vmPolicyIgnoreChanges() };

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
            condition: serviceKeyCondition(naming.slug, mode, principalSecretScopeSlugs(singleVM, svc.slug)),
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
      policyOptions,
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
    policyOptions,
  ),
);

/** Backend service app id when the backend service is deployed, for the bucket statements; undefined otherwise. */
export const backendServiceApplicationId: pulumi.Output<string | undefined> =
  serviceApplicationIds.backend ?? pulumi.output(undefined);
