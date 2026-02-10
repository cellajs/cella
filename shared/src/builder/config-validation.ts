/**
 * Compile-time validation for config consistency.
 * Ensures appConfig arrays match the hierarchy builder types.
 * This file has no runtime effect — all checks are erased at compile time.
 */
import type {
  ContextEntityType,
  EntityType,
  ParentlessProductEntityType,
  ProductEntityType,
} from '../../types';
import { appConfig } from '../../app-config';
import { hierarchy } from '../../default-config';
import type { RequiredConfig } from './types';

// Validate that Config satisfies RequiredConfig.
type Config = typeof appConfig;
((_: RequiredConfig) => {})(null as unknown as Config);

// Validate entityIdColumnKeys has all entity types as keys with correct naming
type ExpectedIdColumnKeys = { readonly [K in EntityType]: `${K}Id` };
const _entityIdKeysCheck: ExpectedIdColumnKeys = appConfig.entityIdColumnKeys;
void _entityIdKeysCheck;

// Validate entityTypes matches hierarchy.allTypes (bi-directional type check)
type HierarchyEntityType = (typeof hierarchy.allTypes)[number];
const _entityTypesMatch1: EntityType extends HierarchyEntityType ? true : false = true;
const _entityTypesMatch2: HierarchyEntityType extends EntityType ? true : false = true;
void _entityTypesMatch1;
void _entityTypesMatch2;

// Validate contextEntityTypes matches hierarchy.contextTypes
type HierarchyContextType = (typeof hierarchy.contextTypes)[number];
const _contextTypesMatch1: ContextEntityType extends HierarchyContextType ? true : false = true;
const _contextTypesMatch2: HierarchyContextType extends ContextEntityType ? true : false = true;
void _contextTypesMatch1;
void _contextTypesMatch2;

// Validate productEntityTypes matches hierarchy.productTypes
type HierarchyProductType = (typeof hierarchy.productTypes)[number];
const _productTypesMatch1: ProductEntityType extends HierarchyProductType ? true : false = true;
const _productTypesMatch2: HierarchyProductType extends ProductEntityType ? true : false = true;
void _productTypesMatch1;
void _productTypesMatch2;

// Validate parentlessProductEntityTypes matches hierarchy.parentlessProductTypes
type HierarchyParentlessProductType = (typeof hierarchy.parentlessProductTypes)[number];
const _parentlessProductTypesMatch1: ParentlessProductEntityType extends HierarchyParentlessProductType
  ? true
  : false = true;
const _parentlessProductTypesMatch2: HierarchyParentlessProductType extends ParentlessProductEntityType
  ? true
  : false = true;
void _parentlessProductTypesMatch1;
void _parentlessProductTypesMatch2;
