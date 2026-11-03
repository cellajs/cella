import { resolvePerMode } from '../lib/general-config';
import { deployMode } from '../pulumi-context';
import { generalConfig } from './general.config';

/** Mode-aware sizing of the foundation (database, asset retention) as one object for resource modules; a machine's type is its service's. */
export const sizing = {
  dbNodeType: resolvePerMode(generalConfig.database.nodeType, deployMode),
  dbVolumeSize: resolvePerMode(generalConfig.database.volumeSizeGb, deployMode),
  assetRetentionDays: resolvePerMode(generalConfig.assets.retentionDays, deployMode),
};
