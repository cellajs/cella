import { machineApplications } from '../lib/scaleway/declared-identities';
import { resolveApplicationIdByName } from '../lib/scaleway/iam-client';
import { ensureApplication, type ProvisionScopedKeyOptions } from '../lib/scaleway/scaleway-iam';
import { principalServices } from '../lib/services';

export interface MachineIdentitiesOptions extends ProvisionScopedKeyOptions {
  /** Deploy mode; machine identities are per mode. */
  mode: string;
  /** The registry services that have an identity (see `principalServices`). */
  services: readonly string[];
}

export interface MachineIdentitiesResult {
  /** service slug → application id. */
  serviceAppIds: Record<string, string>;
  /** The boot fetcher application id. */
  bootAppId: string;
  /** The builder application id. */
  builderAppId: string;
  /** Every created/reused application id (services, boot, builder). */
  allAppIds: string[];
}

/**
 * Provision the per-service VM applications (`<slug>-<mode>-vm-<service>`),
 * the boot fetcher application (`<slug>-<mode>-boot`) and the builder application (`<slug>-<mode>-builder`), applications only:
 * their POLICIES are the machine policies, written at Owner moments
 * (lib/scaleway/machine-policies.ts), and
 * their standing KEYS are made at Owner moments too (tasks/machine-keys.ts) and
 * only handed over by a deploy. Runs with an IAMManager-capable key.
 * Idempotent: an existing application is reused by name.
 */
export async function makeMachineIdentities(opts: MachineIdentitiesOptions): Promise<MachineIdentitiesResult> {
  const serviceAppIds: Record<string, string> = {};
  for (const service of opts.services) {
    const app = await ensureApplication(opts, {
      suffix: `vm-${service}`,
      description: `Non-human principal for ${service} service machines: reads its own secret folder (standing key, handed over by a deploy)`,
    });
    serviceAppIds[service] = app.id;
  }
  const boot = await ensureApplication(opts, {
    suffix: 'boot',
    description: 'Non-human boot fetcher: registry pull, boot-diag write, handoff-only secret read (standing key)',
  });
  const builder = await ensureApplication(opts, {
    suffix: 'builder',
    description: "Non-human builder: pushes a release's images and writes its frontend files, on a builder machine",
  });
  return {
    serviceAppIds,
    bootAppId: boot.id,
    builderAppId: builder.id,
    allAppIds: [...Object.values(serviceAppIds), boot.id, builder.id],
  };
}

/** Ensure every machine identity exists: one `vm-<service>` application per `principalServices` entry, the boot application and the builder. The setup and Update identities call it, at Owner moments. */
export async function ensureMachineIdentities(opts: Omit<MachineIdentitiesOptions, 'services'>): Promise<MachineIdentitiesResult> {
  return makeMachineIdentities({ ...opts, services: principalServices().map((svc) => svc.slug) });
}

/**
 * The machine identities that do not exist yet, by application name. Read-only: the operator key finds out with it what only an Owner API
 * key can create.
 */
export async function missingMachineIdentities(opts: { secretKey: string; organizationId: string; slug: string; mode: string }): Promise<string[]> {
  const wanted = machineApplications(opts.slug, opts.mode);
  const missing: string[] = [];
  for (const name of wanted) {
    if (!(await resolveApplicationIdByName({ secretKey: opts.secretKey }, opts.organizationId, name))) missing.push(name);
  }
  return missing;
}
