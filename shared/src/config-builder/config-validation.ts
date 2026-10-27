import { policyMatrix } from '../../config/permissions-config.ts';
import { getEntityPolicies, isRowCondition } from '../permissions/index.ts';
import { appConfig } from './app-config.ts';
import type { RequiredConfig } from './types.ts';

// Checks the config against the policy matrix, which `app-config.ts` cannot import: the matrix is built from `appConfig`.
// `shared/index.ts` imports this file, so a program that imports `shared` runs it; one that imports only a config file
// or `app-config.ts` (the sdk, infra) does not.

// Validate that Config satisfies RequiredConfig (compile-time only).
type Config = typeof appConfig;
type _ConfigSatisfiesRequired = Config extends RequiredConfig ? true : never;
const _configValid: _ConfigSatisfiesRequired = true;
void _configValid;

// Unseen tracking needs unconditional channel reads for tracked types; conditional visibility
// keeps endpoint-based counting.
for (const entityType of appConfig.seenTrackedProductTypes) {
  for (const policy of getEntityPolicies(policyMatrix, entityType)) {
    if (isRowCondition(policy.permissions.read)) {
      throw new Error(
        `[Config] Seen-tracked entity type "${entityType}" has a row-conditional read grant ` +
          `(${policy.channelType}.${policy.role}: read '${policy.permissions.read}'): unseen ` +
          'badge counting requires unconditional channel read for tracked types.',
      );
    }
  }
}
