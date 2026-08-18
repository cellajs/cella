import * as pulumi from '@pulumi/pulumi';
import type { ServiceName } from '../compose/compose';
import { resolvePerMode } from '../lib/general-config';
import { servicesByName } from '../lib/services';
import { deployMode, mode } from '../pulumi-context';
import { generalConfig } from './general.config';

// Compute is deferred only during a fresh provision, marked by `bootstrap:computeDeferred` before the first `pulumi up`.
const computeDeferred = new pulumi.Config('bootstrap').get('computeDeferred') !== undefined;

// VM size is per-service, declared in config/services.config.ts
const registryInstanceType = (serviceName: ServiceName): string => {
  const size = servicesByName.get(serviceName)?.instanceType;
  const resolved = typeof size === 'string' ? size : size?.[deployMode];
  if (resolved === undefined)
    throw new Error(
      `Service '${serviceName}' has no instanceType for mode '${mode}' in the registry (config/services.config.ts).`,
    );
  return resolved;
};

/** Mode-aware sizing defaults (compute image, db sizing) as one object for resource modules. */
export const sizing = {
  computeImage: resolvePerMode(generalConfig.compute.image, deployMode),
  dbNodeType: resolvePerMode(generalConfig.database.nodeType, deployMode),
  dbVolumeSize: resolvePerMode(generalConfig.database.volumeSizeGb, deployMode),
  assetRetentionDays: resolvePerMode(generalConfig.assets.retentionDays, deployMode),
  instanceTypeFor: registryInstanceType,
  computeEnabled: !computeDeferred,
};
