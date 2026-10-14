import * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { engineConfig } from '../config/engine-config';
import { actionCommand } from '../lib/operator-actions';

const appConfig = engineConfig();

import { ADMISSION_RUN_ENV, allPrincipalNames } from '../lib/scaleway/principals';
import { principalServices } from '../lib/services';
import { mode, organizationId } from '../pulumi-context';

const names = allPrincipalNames(appConfig, mode);

// The engine's IAM principals, resolved by their canonical per-mode names. A required principal throws on a resolution failure; an optional one warns and drops its statements, so a missing admin app never blocks a release.

/**
 * Whether a failed application lookup means the application does not exist. Only a real not-found counts: a transient IAM outage must not
 * demote a required principal or drop admin statements. The provider says "no element found with the name <name>" (measured on staging).
 */
export function isAbsentApplication(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /not.?found|no element found|404|does not exist/i.test(message);
}

/** Resolve an application id by name, or undefined when the app is absent. */
function findApplicationId(name: string): pulumi.Output<string | undefined> {
  return pulumi.output(
    scaleway.iam
      .getApplication({ name, organizationId })
      .then((app) => app.applicationId || undefined)
      .catch((error: unknown) => {
        if (isAbsentApplication(error)) return undefined;
        throw error;
      }),
  );
}

/**
 * Require a principal: missing means the stack cannot function, so fail with guidance.
 * With `pendingOnPreview`, a preview continues on an unknown id and names the application, so the plan of a registry change is readable before
 * the Owner API key creates it. An `up` still fails without the application.
 */
function requirePrincipalId(
  resolved: pulumi.Output<string | undefined>,
  label: string,
  opts: { pendingOnPreview?: boolean } = {},
): pulumi.Output<string> {
  return resolved.apply((id) => {
    if (id) return id;
    if (opts.pendingOnPreview && pulumi.runtime.isDryRun()) {
      pulumi.log.warn(`IAM application for ${label} does not exist yet: \`${actionCommand('identity')}\` creates it.`);
      // The engine shows an unknown input as "known after apply"; the type has no word for it.
      return pulumi.unknown as unknown as string;
    }
    throw new Error(
      `IAM application for ${label} not found: run the pnpm infra setup first, or \`${actionCommand('identity')}\` after a registry change.`,
    );
  });
}

/**
 * Operator application id: the app's privileged human principal, one per app. Optional: until `operator-key` creates it, its bucket-policy
 * statements are dropped with a warning.
 */
export const operatorApplicationId: pulumi.Output<string | undefined> = findApplicationId(names.operator).apply((id) => {
  if (id) return id;
  pulumi.log.warn(
    `Operator IAM application '${names.operator}' not found: its bucket-policy statements are dropped this update. \`${actionCommand('operator-key')}\` creates it.`,
  );
  return undefined;
});

/** CI deploy application id: the principal CI authenticates as. Required. */
export const ciDeployApplicationId = requirePrincipalId(findApplicationId(names.ciDeploy), `CI deploy ('${names.ciDeploy}')`);

/** Observer application id: the read-only key on the person's machine. Optional: until an Owner moment creates it, its statements are dropped. */
export const observerApplicationId: pulumi.Output<string | undefined> = findApplicationId(names.observer).apply((id) => {
  if (id) return id;
  pulumi.log.warn(`Observer IAM application '${names.observer}' not found: its bucket-policy statements are dropped this update.`);
  return undefined;
});

/**
 * The retired admin application's id, on the admission run only: that run writes the bucket policies with the admin key, so they keep admitting
 * it until the run ends, and the apply after it drops the statement. Undefined on every other run.
 */
export const retiredAdminApplicationId: pulumi.Output<string | undefined> =
  process.env[ADMISSION_RUN_ENV] === '1' ? findApplicationId(names.admin) : pulumi.output(undefined);

// Machine principals: one application per registry service, wherever it runs, plus the boot fetcher. Registry-derived: neither an `enabled`
// toggle nor a placement changes a principal.

const vmServices = principalServices();

/** Per-service application ids. Required for an `up`; a preview plans a registry service whose application the next apply creates. */
export const serviceApplicationIds: Record<string, pulumi.Output<string>> = Object.fromEntries(
  vmServices.map((svc) => [
    svc.slug,
    requirePrincipalId(findApplicationId(names.vmService(svc.slug)), `service VM ('${names.vmService(svc.slug)}')`, { pendingOnPreview: true }),
  ]),
);

/** Boot fetcher application id. Required. */
export const bootApplicationId: pulumi.Output<string> = requirePrincipalId(findApplicationId(names.boot), `boot fetcher ('${names.boot}')`);

/** Builder application id, for the frontend bucket's statement. Required; a preview plans it before the next identity update makes it. */
export const builderApplicationId: pulumi.Output<string> = requirePrincipalId(findApplicationId(names.builder), `builder ('${names.builder}')`, {
  pendingOnPreview: true,
});

/** Backend service app id when the backend service is deployed, for the bucket statements; undefined otherwise. */
export const backendServiceApplicationId: pulumi.Output<string | undefined> = serviceApplicationIds.backend ?? pulumi.output(undefined);
