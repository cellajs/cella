import { hierarchy } from '../../config/config.default.ts';
import type { ChannelEntityType, EntityIdColumnKey, EntityType } from '../../types.ts';
import { appConfig } from '../config-builder/app-config.ts';
import { toColumnName, toTableName } from '../utils/schema-naming.ts';

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

/**
 * The channels a test row of `entityType` needs, seeded organization-first under `organizationId`, and the id columns
 * the row carries. A channel below the organization takes its id from `makeChannelId`; without one, it throws.
 */
export const buildTestEntityHierarchyPlan = ({
  entityType,
  organizationId,
  makeChannelId,
}: BuildTestEntityHierarchyPlanOptions): TestEntityHierarchyPlan => {
  const ancestors = hierarchy.getOrderedAncestors(entityType);
  const channelIdsByType: Partial<Record<ChannelEntityType, string>> = {};
  // A parameter keeps the type wide: where the organization is the only channel type, `channelType` past its branch is `never`.
  const setChannelId = (channelType: ChannelEntityType, id: string) => {
    channelIdsByType[channelType] = id;
  };
  const channelColumn = (channelType: ChannelEntityType, id: string): TestChannelColumn => {
    const idKey = appConfig.entityIdColumnKeys[channelType];
    return { channelType, id, idKey, columnName: toColumnName(idKey) };
  };
  const seedChannelRows: TestChannelRow[] = [];
  let generatedIndex = 0;

  for (const channelType of [...ancestors].reverse()) {
    if (channelType === 'organization') {
      setChannelId(channelType, organizationId);
      continue;
    }

    const parentChannelType = hierarchy.getParent(channelType);
    const parentId = parentChannelType && channelIdsByType[parentChannelType];
    if (!parentChannelType || !parentId) {
      throw new Error(`Cannot seed ${channelType}: missing parent channel id for ${parentChannelType}`);
    }
    if (!makeChannelId) {
      throw new Error(`Cannot seed ${channelType}: makeChannelId is required for sub-organization ancestors`);
    }

    const id = makeChannelId(channelType, generatedIndex++);
    setChannelId(channelType, id);

    const parentIdKey = appConfig.entityIdColumnKeys[parentChannelType];
    // Rows are seeded organization-first, so every ancestor id is known.
    const ancestorColumns: TestChannelColumn[] = [];
    for (let cursor: ChannelEntityType | null = parentChannelType; cursor; ) {
      const ancestorId = channelIdsByType[cursor];
      if (!ancestorId) {
        throw new Error(`Cannot seed ${channelType}: missing ancestor channel id for ${cursor}`);
      }
      ancestorColumns.push(channelColumn(cursor, ancestorId));
      cursor = hierarchy.getParent(cursor);
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
    return channelColumn(channelType, id);
  });

  return {
    entityType,
    channelIdsByType,
    channelIdColumns: Object.fromEntries(sqlChannelColumns.map(({ idKey, id }) => [idKey, id])),
    sqlChannelColumns,
    seedChannelRows,
  };
};

/**
 * The channels a row needs when it homes at its deepest strict ancestor: that ancestor and every channel above it.
 * @param ancestors - The row's ancestor types, deepest first.
 * @param nullable - The ancestors the row may leave unset.
 */
export const channelsDownToStrictHome = <T extends string>(ancestors: readonly T[], nullable: readonly T[]): T[] => {
  const deepestStrict = ancestors.findIndex((type) => !nullable.includes(type));
  return deepestStrict === -1 ? [] : ancestors.slice(deepestStrict);
};

/**
 * The plan of a row that homes at its deepest strict ancestor, the one place every app's hierarchy allows: the channels
 * below that ancestor are neither seeded nor set on the row. The same plan in the template, whose attachments live in
 * the organization.
 */
export const toStrictHomePlan = (plan: TestEntityHierarchyPlan): TestEntityHierarchyPlan => {
  const needed = channelsDownToStrictHome<ChannelEntityType>(
    hierarchy.getOrderedAncestors(plan.entityType),
    hierarchy.getNullableAncestors(plan.entityType),
  );
  const sqlChannelColumns = plan.sqlChannelColumns.filter((column) => needed.includes(column.channelType));
  return {
    ...plan,
    channelIdsByType: Object.fromEntries(sqlChannelColumns.map(({ channelType, id }) => [channelType, id])),
    channelIdColumns: Object.fromEntries(sqlChannelColumns.map(({ idKey, id }) => [idKey, id])),
    sqlChannelColumns,
    seedChannelRows: plan.seedChannelRows.filter((row) => needed.includes(row.channelType)),
  };
};
