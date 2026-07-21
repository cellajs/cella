import { hierarchy } from '../../config/config.default';
import { appConfig } from '../config-builder/app-config';
import type { ChannelEntityType, EntityIdColumnKey, EntityType } from '../../types';
import { toColumnName, toTableName } from '../permissions';

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
  rootChannelId: string;
  rootChannelType?: ChannelEntityType;
  makeChannelId?: (channelType: ChannelEntityType, index: number) => string;
}

const rootChannelTypes = hierarchy.channelTypes.filter((type) => hierarchy.getParent(type) === null);

export const buildTestEntityHierarchyPlan = ({
  entityType,
  rootChannelId,
  rootChannelType = rootChannelTypes[0],
  makeChannelId,
}: BuildTestEntityHierarchyPlanOptions): TestEntityHierarchyPlan => {
  if (!rootChannelType) {
    throw new Error('Entity hierarchy has no root context type');
  }

  const ancestors = hierarchy.getOrderedAncestors(entityType) as ChannelEntityType[];
  const channelIdsByType: Partial<Record<ChannelEntityType, string>> = {};
  const setChannelId = (channelType: ChannelEntityType, id: string) => {
    channelIdsByType[channelType] = id;
  };
  const seedChannelRows: TestChannelRow[] = [];
  let generatedIndex = 0;

  for (const channelType of [...ancestors].reverse()) {
    if (channelType === rootChannelType) {
      setChannelId(channelType, rootChannelId);
      continue;
    }

    const parentChannelType = hierarchy.getParent(channelType) as ChannelEntityType | null;
    if (!parentChannelType) {
      continue;
    }

    const parentId = channelIdsByType[parentChannelType];
    if (!parentId) {
      throw new Error(`Cannot seed ${channelType}: missing parent context id for ${parentChannelType}`);
    }
    if (!makeChannelId) {
      throw new Error(`Cannot seed ${channelType}: makeChannelId is required for non-root ancestors`);
    }

    const id = makeChannelId(channelType, generatedIndex++);
    setChannelId(channelType, id);

    const parentIdKey = appConfig.entityIdColumnKeys[parentChannelType];
    seedChannelRows.push({
      channelType,
      id,
      tableName: toTableName(channelType),
      parentChannelType,
      parentId,
      parentIdKey,
      parentColumnName: toColumnName(parentIdKey),
    });
  }

  const sqlChannelColumns = ancestors.map((channelType) => {
    const id = channelIdsByType[channelType];
    if (!id) {
      throw new Error(`Missing context id for ${channelType}`);
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
