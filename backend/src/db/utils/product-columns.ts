import { bigint, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import type { ProductEntityType } from 'shared';
import { maxLength } from '#/db/utils/constraints';
import type { ActorId } from '#/db/utils/ids';
import { tenantEntityColumns } from '#/db/utils/tenant-entity-columns';
import { actorsTable } from '#/modules/actors/actors-db';
import { stxColumns } from './stx-columns';

export const productColumns = <T extends ProductEntityType>(entityType: T) => ({
  ...tenantEntityColumns(entityType),
  name: varchar({ length: maxLength.field }).notNull().default(`New ${entityType}`),
  ...stxColumns,
  description: varchar({ length: maxLength.html }).default(''),
  keywords: varchar({ length: maxLength.html }).notNull().default(''),
  createdBy: uuid()
    .references(() => actorsTable.id, { onDelete: 'set null' })
    .$type<ActorId>(),
  updatedBy: uuid()
    .references(() => actorsTable.id, { onDelete: 'set null' })
    .$type<ActorId>(),
  deletedAt: timestamp('deleted_at', { mode: 'string' }),
  deletedBy: uuid('deleted_by')
    .references(() => actorsTable.id, { onDelete: 'set null' })
    .$type<ActorId>(),
  /** Actor-independent reads when the entity declares `publicRead()`. Parent publication is propagated as data. */
  publicAt: timestamp('public_at', { mode: 'string' }),
  /** Org sequence driving delta sync. Stamped post-commit by the CDC worker; rows hold the default 0 until then. */
  seq: bigint('seq', { mode: 'number' }).notNull().default(0),
});

/**
 * @deprecated The fan-out reads mentions from `description`, so no column stores them. Empty, so a
 * table that still spreads it drops its `mentions` column on the next `pnpm generate`; removed in a
 * later release.
 * @public
 */
export const mentionableColumns = {};
