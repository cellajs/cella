import { hierarchy } from '../../config/config.default';
import { appConfig } from '../config-builder/app-config';
import type { ContextEntityType, EntityIdColumnKey, EntityType } from '../../types';
import { toColumnName, toTableName } from '../permissions';

export interface TestEntityContextColumn {
  contextType: ContextEntityType;
  id: string;
  idKey: EntityIdColumnKey<ContextEntityType>;
  columnName: string;
}

export interface TestEntityContextRow {
  contextType: ContextEntityType;
  id: string;
  tableName: string;
  parentContextType: ContextEntityType;
  parentId: string;
  parentIdKey: EntityIdColumnKey<ContextEntityType>;
  parentColumnName: string;
}

export interface TestEntityHierarchyPlan {
  entityType: EntityType;
  contextIdsByType: Partial<Record<ContextEntityType, string>>;
  contextIdColumns: Record<string, string>;
  sqlContextColumns: TestEntityContextColumn[];
  seedContextRows: TestEntityContextRow[];
}

export interface BuildTestEntityHierarchyPlanOptions {
  entityType: EntityType;
  rootContextId: string;
  rootContextType?: ContextEntityType;
  makeContextId?: (contextType: ContextEntityType, index: number) => string;
}

const rootContextTypes = hierarchy.contextTypes.filter((type) => hierarchy.getParent(type) === null);

export const buildTestEntityHierarchyPlan = ({
  entityType,
  rootContextId,
  rootContextType = rootContextTypes[0],
  makeContextId,
}: BuildTestEntityHierarchyPlanOptions): TestEntityHierarchyPlan => {
  if (!rootContextType) {
    throw new Error('Entity hierarchy has no root context type');
  }

  const ancestors = hierarchy.getOrderedAncestors(entityType) as ContextEntityType[];
  const contextIdsByType: Partial<Record<ContextEntityType, string>> = {};
  const setContextId = (contextType: ContextEntityType, id: string) => {
    contextIdsByType[contextType] = id;
  };
  const seedContextRows: TestEntityContextRow[] = [];
  let generatedIndex = 0;

  for (const contextType of [...ancestors].reverse()) {
    if (contextType === rootContextType) {
      setContextId(contextType, rootContextId);
      continue;
    }

    const parentContextType = hierarchy.getParent(contextType) as ContextEntityType | null;
    if (!parentContextType) {
      continue;
    }

    const parentId = contextIdsByType[parentContextType];
    if (!parentId) {
      throw new Error(`Cannot seed ${contextType}: missing parent context id for ${parentContextType}`);
    }
    if (!makeContextId) {
      throw new Error(`Cannot seed ${contextType}: makeContextId is required for non-root ancestors`);
    }

    const id = makeContextId(contextType, generatedIndex++);
    setContextId(contextType, id);

    const parentIdKey = appConfig.entityIdColumnKeys[parentContextType];
    seedContextRows.push({
      contextType,
      id,
      tableName: toTableName(contextType),
      parentContextType,
      parentId,
      parentIdKey,
      parentColumnName: toColumnName(parentIdKey),
    });
  }

  const sqlContextColumns = ancestors.map((contextType) => {
    const id = contextIdsByType[contextType];
    if (!id) {
      throw new Error(`Missing context id for ${contextType}`);
    }

    const idKey = appConfig.entityIdColumnKeys[contextType];
    return {
      contextType,
      id,
      idKey,
      columnName: toColumnName(idKey),
    };
  });

  return {
    entityType,
    contextIdsByType,
    contextIdColumns: Object.fromEntries(sqlContextColumns.map(({ idKey, id }) => [idKey, id])),
    sqlContextColumns,
    seedContextRows,
  };
};
