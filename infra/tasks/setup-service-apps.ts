import { type ProvisionScopedKeyOptions, provisionScopedKey } from '../lib/scaleway/scaleway-iam';

export interface SetupServiceAppsOptions extends ProvisionScopedKeyOptions {
  /** Deploy mode; service apps are always per-mode. */
  mode: string;
  /** Deployed service slugs (from the services registry). */
  services: readonly string[];
}

export interface ServiceAppsResult {
  /** service slug → application id. */
  serviceAppIds: Record<string, string>;
  /** The boot fetcher application id. */
  bootAppId: string;
  /** Every created/reused application id (services + boot), for the CI key-mint condition. */
  allAppIds: string[];
}

/**
 * Provision the per-service VM applications (`<slug>-<mode>-vm-<service>`) and
 * the boot fetcher application (`<slug>-<mode>-boot`), applications only:
 * their POLICIES are Pulumi-managed (resources/vm-iam.ts, bootstrap-owned) and
 * their KEYS are minted per deploy by CI (tasks/mint-generation-keys.ts) under
 * the conditioned IAMApplicationManager grant. Runs during bootstrap/migration
 * with an IAMManager-capable key; the returned ids feed the CI policy's
 * key-mint condition, so this MUST run before setup-ci-key.
 */
export async function setupServiceApps(opts: SetupServiceAppsOptions): Promise<ServiceAppsResult> {
  const serviceAppIds: Record<string, string> = {};
  for (const service of opts.services) {
    const app = await provisionScopedKey(opts, {
      suffix: `vm-${service}`,
      appDescription: `Non-human principal for ${service} service VMs: path-conditioned secret read (key minted per deploy)`,
      policyDescription: 'unused (Pulumi manages the policy)',
      managePolicy: false,
      mintKey: false,
    });
    serviceAppIds[service] = app.applicationId;
  }
  const boot = await provisionScopedKey(opts, {
    suffix: 'boot',
    appDescription:
      'Non-human boot fetcher: registry pull, boot-diag write, handoff-only secret read (key minted per deploy)',
    policyDescription: 'unused (Pulumi manages the policy)',
    managePolicy: false,
    mintKey: false,
  });
  return {
    serviceAppIds,
    bootAppId: boot.applicationId,
    allAppIds: [...Object.values(serviceAppIds), boot.applicationId],
  };
}
