import * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { engineConfig as appConfig } from '../config/engine-config';
import { actionCommand } from '../lib/operator-actions';
import { declaresUploads } from '../lib/scaleway/declared-identities';
import { allPrincipalNames } from '../lib/scaleway/principals';
import { errorMessage } from '../lib/utils/errors';
import { mode, organizationId } from '../pulumi-context';

const names = allPrincipalNames(appConfig, mode);

// The engine's IAM principals, resolved by their canonical per-mode names. A required principal throws on a resolution failure; an optional one warns and drops its statements, so a missing admin app never blocks a release.

/**
 * Whether a failed principal lookup means the application or group does not exist. Only a real not-found counts: a transient IAM outage
 * must not demote a required principal or drop the people's statements. The provider says "no element found with the name <name>"
 * (measured on staging).
 */
export function isAbsentApplication(error: unknown): boolean {
  const message = errorMessage(error);
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

/**
 * The operators group's members, by user id, as IAM lists them at apply time: the people whose own one-day keys the bucket policies admit
 * beside the operator application. Empty, with a warning, until `operator-key` makes the group.
 */
export const operatorMemberUserIds: pulumi.Output<string[]> = pulumi.output(
  scaleway.iam
    .getGroup({ name: names.operators, organizationId })
    .then((group) => group.userIds)
    .catch((error: unknown) => {
      if (!isAbsentApplication(error)) throw error;
      pulumi.log.warn(
        `Operators IAM group '${names.operators}' not found: only '${names.operator}' is admitted to the buckets this update. \`${actionCommand('operator-key')}\` creates it.`,
      );
      return [];
    }),
);

/** CI deploy application id: the principal CI authenticates as. Required. */
export const ciDeployApplicationId = requirePrincipalId(findApplicationId(names.ciDeploy), `CI deploy ('${names.ciDeploy}')`);

/** Observer application id: the read-only key on the person's machine. Optional: until an Owner moment creates it, its statements are dropped. */
export const observerApplicationId: pulumi.Output<string | undefined> = findApplicationId(names.observer).apply((id) => {
  if (id) return id;
  pulumi.log.warn(`Observer IAM application '${names.observer}' not found: its bucket-policy statements are dropped this update.`);
  return undefined;
});

/**
 * Uploads application id, for the upload buckets' statements: the backend signs its uploads and presigned URLs with its key. Required where
 * the registry has upload buckets; a preview plans it before the next identity update makes it. Undefined without upload buckets.
 */
export const uploadsApplicationId: pulumi.Output<string | undefined> = declaresUploads()
  ? requirePrincipalId(findApplicationId(names.uploads), `uploads ('${names.uploads}')`, { pendingOnPreview: true })
  : pulumi.output(undefined);
