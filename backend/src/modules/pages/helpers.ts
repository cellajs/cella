import { type SQL, sql } from 'drizzle-orm';
import { db } from '#/db/db';
import { pagesTable } from '#/db/schema/pages';
import { Page } from './schema';

export const getPagesWithChildren = async (condition: SQL): Promise<Page[]> => {
  const statement = sql`
    WITH RECURSIVE nested AS (
      SELECT * FROM ${pagesTable} WHERE ${condition}
      UNION
      SELECT * FROM ${pagesTable} np INNER JOIN nested n ON n.id = np.parentId
    )
    SELECT * FROM nested
  `;

  return await db.execute(statement);
};
