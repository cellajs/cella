import { getTableName } from 'drizzle-orm';
import { channelTables } from '#/db/channel-tables';

/** The image columns of the users table and of every channel table (`channelColumns`): URLs on the public CDN. */
export const imageColumns = ['thumbnail_url', 'banner_url'] as const;

/**
 * The columns of an entity table that name stored files, by table name: what its delete trigger copies into
 * `deleted_storage`, so the cleanup job can delete the files of a row that is gone. An app product table that stores
 * files adds its entry; a shape other than an attachment's (`bucket_name` plus `keys`) or an image URL also needs its
 * reading in the cleanup job's `ownedObjectsOf`.
 */
export const storageColumnsOf = (tableName: string): readonly string[] => {
  if (tableName === 'users' || Object.values(channelTables).some((table) => getTableName(table()) === tableName)) return imageColumns;
  if (tableName === 'attachments') return ['bucket_name', 'keys'];
  return [];
};
