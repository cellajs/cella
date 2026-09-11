import { type ProvisionScopedKeyOptions, provisionScopedKey } from '../lib/scaleway/scaleway-iam';
import { principalServices } from '../lib/services';

export interface SetupServiceAppsOptions extends ProvisionScopedKeyOptions {
  /** Deploy mode; service apps are always per-mode. */
  mode: string;
  /** Registry principal slugs (see `principalServices`). */
  services: readonly string[];
}

export interface ServiceAppsResult {
  /** service slug → application id. */
  serviceAppIds: Record<string, string>;
  /** The boot fetcher application id. */
  bootAppId: string;
  /** Every created/reused application id (services + boot); their presence gates the CI key-mint rule. */
  allAppIds: string[];
}

/**
 * Provision the per-service VM applications (`<slug>-<mode>-vm-<service>`) and
 * the boot fetcher application (`<slug>-<mode>-boot`), applications only:
 * their POLICIES are Pulumi-managed (resources/vm-iam.ts, bootstrap-owned) and
 * their KEYS are minted per deploy by CI (tasks/mint-generation-keys.ts) under
 * the unconditioned org-wide IAMApplicationManager grant (the boundary is the
 * absent IAMPolicyManager). Runs with an IAMManager-capable key; the returned
 * ids gate the presence of the CI key-mint rule, so bootstrap runs this before
 * setup-ci-key. Idempotent: an existing application is reused by name.
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

/** Ensure every registry principal exists: one `vm-<service>` application per `principalServices` entry plus the boot application. Bootstrap and "Apply infra change" share it, so a registry change converges in one privileged run. */
export async function ensureRegistryPrincipals(
  opts: Omit<SetupServiceAppsOptions, 'services'> & { singleVM: boolean },
): Promise<ServiceAppsResult> {
  const { singleVM, ...rest } = opts;
  return setupServiceApps({ ...rest, services: principalServices(singleVM).map((svc) => svc.slug) });
}
