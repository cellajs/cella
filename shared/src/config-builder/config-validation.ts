import type {
  ChannelEntityType,
  EntityIdColumnKeysShape,
  EntityType,
  ProductEntityType,
} from '../../types';
import { accessPolicies } from '../../config/permissions-config';
import { appConfig } from './app-config';
import { hierarchy } from '../../config/config.default';
import { getSubjectPolicies, isRowCondition } from '../permissions';
import type { RequiredConfig } from './types';

// Validate that Config satisfies RequiredConfig (compile-time only).
type Config = typeof appConfig;
type _ConfigSatisfiesRequired = Config extends RequiredConfig ? true : never;
const _configValid: _ConfigSatisfiesRequired = true;
void _configValid;

// Validate entityIdColumnKeys has all entity types as keys with correct `${K}Id` naming
const _entityIdKeysCheck: EntityIdColumnKeysShape = appConfig.entityIdColumnKeys;
void _entityIdKeysCheck;

// Validate entityTypes matches hierarchy.allTypes (bi-directional type check)
type HierarchyEntityType = (typeof hierarchy.allTypes)[number];
const _entityTypesMatch1: EntityType extends HierarchyEntityType ? true : false = true;
const _entityTypesMatch2: HierarchyEntityType extends EntityType ? true : false = true;
void _entityTypesMatch1;
void _entityTypesMatch2;

// Validate channelEntityTypes matches hierarchy.channelTypes
type HierarchyChannelType = (typeof hierarchy.channelTypes)[number];
const _channelTypesMatch1: ChannelEntityType extends HierarchyChannelType ? true : false = true;
const _channelTypesMatch2: HierarchyChannelType extends ChannelEntityType ? true : false = true;
void _channelTypesMatch1;
void _channelTypesMatch2;

// Validate productEntityTypes matches hierarchy.productTypes
type HierarchyProductType = (typeof hierarchy.productTypes)[number];
const _productTypesMatch1: ProductEntityType extends HierarchyProductType ? true : false = true;
const _productTypesMatch2: HierarchyProductType extends ProductEntityType ? true : false = true;
void _productTypesMatch1;
void _productTypesMatch2;


// The unseen ledger requires unconditional channel reads for tracked types.
// Conditional visibility must keep endpoint-based counting.
for (const entityType of appConfig.seenTrackedEntityTypes) {
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
