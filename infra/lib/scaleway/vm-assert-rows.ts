import type { EngineConfig } from '../../config/engine-config';
import { principalSecretCondition } from '../runtime-secrets';
import { principalServices } from '../services';
import { DEPLOY_PERMISSION_SETS } from './deploy-policy';
import {
  BACKEND_S3_PERMISSION_SETS,
  BOOT_PROJECT_PERMISSION_SETS,
  BUILDER_PROJECT_PERMISSION_SETS,
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
}

/**
 * One assertion row per principal, built by the same shared builders the Pulumi program uses so the deploy's grant-verification step and the
 * Apply's self-check compare strings, not semantics. Principals follow the registry; their keys are checked where the deploy stages them.
 */
export function buildVmAssertRows(appConfig: EngineConfig): VmAssertRow[] {
  const names = principalNames(appConfig.slug, appConfig.mode);
  return [
    ...principalServices().map((svc) => ({
      app: names.vmService(svc.slug),
      sets: [...SERVICE_SECRET_PERMISSION_SETS, ...(svc.s3Access ? BACKEND_S3_PERMISSION_SETS : [])],
      condition: principalSecretCondition(appConfig.slug, appConfig.mode, svc.slug),
    })),
    {
      app: names.boot,
      sets: [...BOOT_PROJECT_PERMISSION_SETS, ...SERVICE_SECRET_PERMISSION_SETS],
      condition: bootKeyCondition(appConfig.slug, appConfig.mode),
    },
    // The builder's rules are unconditioned: each bucket's policy says where it writes.
    { app: names.builder, sets: [...BUILDER_PROJECT_PERMISSION_SETS], condition: '' },
    // The CI app asserts its own grant too: exact set union (missing sets fail deploys later and non-read-only extras are an escalation).
    { app: names.ciDeploy, sets: [...new Set(DEPLOY_PERMISSION_SETS)], condition: '' },
  ];
}
