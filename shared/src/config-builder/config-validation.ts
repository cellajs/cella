import { policyMatrix } from '../../config/permissions-config.ts';
import { getEntityPolicies, isRowCondition } from '../permissions/index.ts';
import { appConfig } from './app-config.ts';
import type { RequiredConfig } from './types.ts';

// Validate that Config satisfies RequiredConfig (compile-time only).
type Config = typeof appConfig;
type _ConfigSatisfiesRequired = Config extends RequiredConfig ? true : never;
const _configValid: _ConfigSatisfiesRequired = true;
void _configValid;

// Entity arrays and id-column keys derive from the hierarchy in config.default.ts, so no
// bidirectional check is needed.

// Unseen tracking needs unconditional channel reads for tracked types; conditional visibility
// keeps endpoint-based counting.
for (const entityType of appConfig.seenTrackedProductTypes) {
  for (const policy of getEntityPolicies(entityType, policyMatrix)) {
    if (isRowCondition(policy.permissions.read)) {
      throw new Error(
        `[Config] Seen-tracked entity type "${entityType}" has a row-conditional read grant ` +
          `(${policy.channelType}.${policy.role}: read '${policy.permissions.read}'): unseen ` +
          'badge counting requires unconditional channel read for tracked types.',
      );
    }
  }
}
