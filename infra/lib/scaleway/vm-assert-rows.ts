import type { EngineConfig } from '../../config/engine-config';
import { principalSecretCondition } from '../runtime-secrets';
import { deployedServices, principalServices } from '../services';
import {
  BACKEND_S3_PERMISSION_SETS,
  BOOT_PROJECT_PERMISSION_SETS,
  CI_RULE_SHAPES,
  SERVICE_SECRET_PERMISSION_SETS,
} from './permissions';
import { principalNames } from './principals';
import { bootKeyCondition } from './secret-paths';

/** One grant assertion: the exact permission sets and secret condition a principal must hold, and whether it must hold no key at all. */
export interface VmAssertRow {
  app: string;
  sets: string[];
  /** '' skips the secret-condition check (the CI app's rules are unconditioned by design). */
  condition: string;
  /** A registry principal with no deployed VM: keeps its policy, must hold zero API keys. */
  dormant?: boolean;
}

/**
 * One assertion row per principal, built by the same shared builders the Pulumi program uses so the deploy's grant-verification step and the
 * Apply's self-check compare strings, not semantics. Principals follow the registry; a registry service outside the deployed set is dormant.
 */
export function buildVmAssertRows(appConfig: EngineConfig): VmAssertRow[] {
  const names = principalNames(appConfig.slug, appConfig.mode);
  const singleVM = appConfig.singleVM ?? false;
  const deployedSlugs = new Set(deployedServices(appConfig.services, singleVM).map((service) => service.slug));
  return [
    ...principalServices(singleVM).map((svc) => ({
      app: names.vmService(svc.slug),
      sets: [...SERVICE_SECRET_PERMISSION_SETS, ...(svc.s3Access ? BACKEND_S3_PERMISSION_SETS : [])],
      condition: principalSecretCondition(appConfig.slug, appConfig.mode, singleVM, svc.slug),
      dormant: !deployedSlugs.has(svc.slug),
    })),
    {
      app: names.boot,
      sets: [...BOOT_PROJECT_PERMISSION_SETS, ...SERVICE_SECRET_PERMISSION_SETS],
      condition: bootKeyCondition(appConfig.slug, appConfig.mode),
    },
    // The CI app asserts its own grant too: exact set union (missing sets fail deploys later and non-read-only extras are an escalation).
    {
      app: names.ciDeploy,
      sets: CI_RULE_SHAPES.flatMap((shape) => [...shape.permissionSets]),
      condition: '',
    },
  ];
}
