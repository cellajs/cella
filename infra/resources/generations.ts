import { engineConfig } from '../config/engine-config';

const appConfig = engineConfig();

import { composeConfig } from '../compose/compose';
import { sizing } from '../config/sizing';
import { deriveGenId } from '../lib/gen-id';
import { type RuntimeSecretConsumer, unionRuntimeSecrets } from '../lib/runtime-secrets';
import { type Generation, selectGenerations } from '../lib/select-generations';
import { coHostedServices, collocatedServices, deployedServices, type ServiceDefinition } from '../lib/services';
import { controlState } from './control';

// Each service gets a VM except workers co-hosted on the backend and containers collocated on the host under singleVM, which route through the host VM.
export const enabled = deployedServices(appConfig.services, appConfig.singleVM);

// Workers folded into the host backend process under singleVM, empty in a split-VM deploy. Their secrets union onto the host VM and a `stop-first` one forces a stop-first host cutover.
export const coHosted = coHostedServices(appConfig.services, appConfig.singleVM);

// `placement: 'host'` containers the boot runner starts beside the host container under singleVM, empty in a split-VM deploy.
export const collocated = collocatedServices(appConfig.services, appConfig.singleVM);
export const hostSlug = enabled.find((s) => s.primaryRollout)?.slug;

/** Runtime-secret consumers a service's VM must carry; under singleVM the host also carries every co-hosted worker's and collocated container's secrets. */
export function secretConsumersFor(svc: ServiceDefinition): RuntimeSecretConsumer[] {
  if (appConfig.singleVM && svc.slug === hostSlug) {
    return [svc.slug, ...coHosted.map((s) => s.slug), ...collocated.map((s) => s.slug)] as RuntimeSecretConsumer[];
  }
  return [svc.slug as RuntimeSecretConsumer];
}

/** Resolve the VM replacement strategy. A singleVM host containing a stop-first worker must cut over stop-first too, so two replication-slot consumers never run at once. */
export function effectiveStrategy(svc: ServiceDefinition): ServiceDefinition['replacementStrategy'] {
  if (
    appConfig.singleVM &&
    svc.slug === hostSlug &&
    [...coHosted, ...collocated].some((s) => s.replacementStrategy === 'stop-first')
  ) {
    return 'stop-first';
  }
  return svc.replacementStrategy;
}

export type { Generation } from '../lib/select-generations';

/** Static configuration that defines a generation, hashed into the genId so any change here rolls a new generation. Excludes the rendered cloud-init (a Pulumi Output, unavailable at plan time) and all secret values. */
function serviceFingerprint(svc: ServiceDefinition): unknown {
  // Collocated containers live on the host VM, so their compose blocks join the host's fingerprint. Empty outside singleVM, keeping the split-VM fingerprint byte-stable.
  const collocatedSlugs = appConfig.singleVM && svc.slug === hostSlug ? collocated.map((s) => s.slug) : [];
  const blockOwners = new Set<string>([svc.slug, ...collocatedSlugs]);
  const blocks = Object.values(composeConfig.services)
    .filter((block) => block.profiles.some((profile) => blockOwners.has(profile)))
    .map((block) => ({ image: block.image, ports: block.ports ?? [], environment: block.environment ?? {} }));
  // Union across secret consumers so the singleVM host's genId also covers the co-hosted workers' secret manifest.
  const secrets = unionRuntimeSecrets(secretConsumersFor(svc)).map((definition) => ({
    secretName: definition.secretName,
    envVar: definition.envVar,
    required: definition.required,
  }));
  return {
    slug: svc.slug,
    port: svc.healthPort,
    // Fingerprint keys are hashed into every genId, so renaming one re-rolls all generations.
    runRelease: svc.runRelease ?? false,
    // Fold in the strategy only when singleVM changes it, keeping the split-VM fingerprint byte-stable.
    ...(effectiveStrategy(svc) !== svc.replacementStrategy ? { singleVmStrategy: effectiveStrategy(svc) } : {}),
    bindings: svc.bindings ?? {},
    ...(collocatedSlugs.length > 0 ? { collocated: collocatedSlugs } : {}),
    blocks,
    secrets,
    computeImage: typeof sizing.computeImage === 'string' ? sizing.computeImage : 'dynamic',
  };
}

/** The live and pending content-addressed generations for a service. Selection is the pure function in lib/select-generations.ts; a singleVM host inherits exclusivity when it owns the replication slot in-process. */
export function activeGenerations(svc: ServiceDefinition): Generation[] {
  const fingerprint = serviceFingerprint(svc);
  return selectGenerations(controlState.rollout[svc.slug], {
    exclusive: effectiveStrategy(svc) === 'stop-first',
    genIdFor: (sha) => deriveGenId(sha, fingerprint),
  });
}
