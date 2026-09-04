import { hierarchy } from '../../config/config.default.ts';
import type { ChannelEntityType, EntityIdColumnKey, EntityType } from '../../types.ts';
import { appConfig } from '../config-builder/app-config.ts';
import { toColumnName, toTableName } from '../permissions/index.ts';

export interface TestChannelColumn {
  channelType: ChannelEntityType;
  id: string;
  idKey: EntityIdColumnKey<ChannelEntityType>;
  columnName: string;
}

export interface TestChannelRow {
  channelType: ChannelEntityType;
  id: string;
  tableName: string;
  parentChannelType: ChannelEntityType;
  parentId: string;
  parentIdKey: EntityIdColumnKey<ChannelEntityType>;
  parentColumnName: string;
  /** Every ancestor id column this row must carry (deep hierarchies keep them all NOT NULL). */
  ancestorColumns: TestChannelColumn[];
}

export interface TestEntityHierarchyPlan {
  entityType: EntityType;
  channelIdsByType: Partial<Record<ChannelEntityType, string>>;
  channelIdColumns: Record<string, string>;
  sqlChannelColumns: TestChannelColumn[];
  seedChannelRows: TestChannelRow[];
}

export interface BuildTestEntityHierarchyPlanOptions {
  entityType: EntityType;
  organizationId: string;
  makeChannelId?: (channelType: ChannelEntityType, index: number) => string;
}

export const buildTestEntityHierarchyPlan = ({
  entityType,
  organizationId,
  makeChannelId,
}: BuildTestEntityHierarchyPlanOptions): TestEntityHierarchyPlan => {
  const ancestors = hierarchy.getOrderedAncestors(entityType) as ChannelEntityType[];
  const channelIdsByType: Partial<Record<ChannelEntityType, string>> = {};
  const setChannelId = (channelType: ChannelEntityType, id: string) => {
    channelIdsByType[channelType] = id;
  };
  const seedChannelRows: TestChannelRow[] = [];
  let generatedIndex = 0;

  for (const channelType of [...ancestors].reverse()) {
    if (channelType === 'organization') {
      setChannelId(channelType, organizationId);
      continue;
    }

    const parentChannelType = hierarchy.getParent(channelType) as ChannelEntityType | null;
    if (!parentChannelType) {
      continue;
    }

    const parentId = channelIdsByType[parentChannelType];
    if (!parentId) {
      throw new Error(`Cannot seed ${channelType}: missing parent channel id for ${parentChannelType}`);
    }
    if (!makeChannelId) {
      throw new Error(`Cannot seed ${channelType}: makeChannelId is required for sub-organization ancestors`);
    }

    const id = makeChannelId(channelType, generatedIndex++);
    setChannelId(channelType, id);

    const parentIdKey = appConfig.entityIdColumnKeys[parentChannelType];
    // Rows are seeded organization-first, so every ancestor id is known. Deep hierarchies keep all
    // ancestor id columns NOT NULL, so filling only the immediate parent breaks grandchildren.
    const ancestorColumns: TestChannelColumn[] = [];
    for (let cursor: ChannelEntityType | null = parentChannelType; cursor; ) {
      const ancestorId = channelIdsByType[cursor];
      if (!ancestorId) {
        throw new Error(`Cannot seed ${channelType}: missing ancestor channel id for ${cursor}`);
      }
      const idKey = appConfig.entityIdColumnKeys[cursor];
      ancestorColumns.push({ channelType: cursor, id: ancestorId, idKey, columnName: toColumnName(idKey) });
      cursor = hierarchy.getParent(cursor) as ChannelEntityType | null;
    }
    seedChannelRows.push({
      channelType,
      id,
      tableName: toTableName(channelType),
      parentChannelType,
      parentId,
      parentIdKey,
      parentColumnName: toColumnName(parentIdKey),
      ancestorColumns,
    });
  }

  const sqlChannelColumns = ancestors.map((channelType) => {
    const id = channelIdsByType[channelType];
    if (!id) {
      throw new Error(`Missing channel id for ${channelType}`);
    }

    const idKey = appConfig.entityIdColumnKeys[channelType];
    return {
      channelType,
      id,
      idKey,
      columnName: toColumnName(idKey),
    };
  });

  return {
    entityType,
    channelIdsByType,
    channelIdColumns: Object.fromEntries(sqlChannelColumns.map(({ idKey, id }) => [idKey, id])),
    sqlChannelColumns,
    seedChannelRows,
  };
};
