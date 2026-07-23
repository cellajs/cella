import type { ProductEntityType } from '../../types';
import { accessPolicies } from '../../config/permissions-config';
import { appConfig } from './app-config';
import { getSubjectPolicies, isRowCondition } from '../permissions';
import type { RequiredConfig } from './types';

// Validate that Config satisfies RequiredConfig (compile-time only).
type Config = typeof appConfig;
type _ConfigSatisfiesRequired = Config extends RequiredConfig ? true : never;
const _configValid: _ConfigSatisfiesRequired = true;
void _configValid;

// Entity arrays and id-column keys are derived from the hierarchy in config.default.ts, so
// hierarchy/config agreement no longer needs bidirectional checks here.

// Unseen tracking requires unconditional channel reads for tracked types.
// Conditional visibility must keep endpoint-based counting.
for (const entityType of appConfig.seenTrackedProductTypes) {
  for (const policy of getSubjectPolicies(entityType as ProductEntityType, accessPolicies)) {
    if (isRowCondition(policy.permissions.read)) {
      throw new Error(
        `[Config] Seen-tracked entity type "${entityType}" has a row-conditional read grant ` +
          `(${policy.channelType}.${policy.role}: read '${policy.permissions.read}') — unseen ` +
          'badge counting requires unconditional channel read for tracked types.',
      );
    }
  }
}
