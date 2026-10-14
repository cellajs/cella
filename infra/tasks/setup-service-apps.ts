import { resolveApplicationIdByName } from '../lib/scaleway/iam-client';
import { principalNames } from '../lib/scaleway/principals';
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
 * their POLICIES are the machine policies, written at Owner moments
 * (lib/scaleway/machine-policies.ts), and
 * their KEYS are minted per deploy by CI (tasks/mint-generation-keys.ts) under
 * the unconditioned org-wide IAMApplicationManager grant (the boundary is the
 * absent IAMPolicyManager). Runs with an IAMManager-capable key; the returned
 * ids gate the presence of the CI key-mint rule, so setup runs this before
 * setup-ci-key. Idempotent: an existing application is reused by name.
 */
export async function setupServiceApps(opts: SetupServiceAppsOptions): Promise<ServiceAppsResult> {
  const serviceAppIds: Record<string, string> = {};
  for (const service of opts.services) {
    const app = await provisionScopedKey(opts, {
      suffix: `vm-${service}`,
      appDescription: `Non-human principal for ${service} service VMs: path-conditioned secret read (key minted per deploy)`,
      policyDescription: 'unused (a machine policy, written apart)',
      managePolicy: false,
      mintKey: false,
    });
    serviceAppIds[service] = app.applicationId;
  }
  const boot = await provisionScopedKey(opts, {
    suffix: 'boot',
    appDescription: 'Non-human boot fetcher: registry pull, boot-diag write, handoff-only secret read (key minted per deploy)',
    policyDescription: 'unused (a machine policy, written apart)',
    managePolicy: false,
    mintKey: false,
  });
  return { serviceAppIds, bootAppId: boot.applicationId, allAppIds: [...Object.values(serviceAppIds), boot.applicationId] };
}

/** Ensure every registry principal exists: one `vm-<service>` application per `principalServices` entry plus the boot application. Setup and "Review & apply changes" share it, so a registry change converges in one privileged run. */
export async function ensureRegistryPrincipals(opts: Omit<SetupServiceAppsOptions, 'services'>): Promise<ServiceAppsResult> {
  return setupServiceApps({ ...opts, services: principalServices().map((svc) => svc.slug) });
}

/**
 * The registry principals that do not exist yet, by application name. Read-only: the operator key finds out with it what only an Owner API
 * key can create.
 */
export async function missingRegistryPrincipals(opts: { secretKey: string; organizationId: string; slug: string; mode: string }): Promise<string[]> {
  const names = principalNames(opts.slug, opts.mode);
  const wanted = [...principalServices().map((svc) => names.vmService(svc.slug)), names.boot];
  const missing: string[] = [];
  for (const name of wanted) {
    if (!(await resolveApplicationIdByName({ secretKey: opts.secretKey }, opts.organizationId, name))) missing.push(name);
  }
  return missing;
}
