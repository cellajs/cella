import { db } from '#/db/db';
import { pagesTable } from '#/db/schema/pages';
import { seed } from "drizzle-seed";

const PAGES_COUNT = 10;

seed(db, { pages: pagesTable })
  .refine((f) => ({
    user: {
      count: 0
    },
    pages: {
      columns: {
        id: f.uuid(),
        entityType: f.valuesFromArray({ values: ['page'] }),
        slug: f.uuid(),
        title: f.jobTitle(), //
        content: f.loremIpsum(),
        keywords: f.valuesFromArray({ values: ['test-tag'] }),
        status: f.valuesFromArray({ values: ['unpublished'] }),
        parentId: f.valuesFromArray({ values: [undefined] }),
        displayOrder: f.valuesFromArray({ values: [0] }),
        createdAt: f.timestamp(),
        createdBy: f.valuesFromArray({ values: ['admin12345678' ] }),
        modifiedAt: f.timestamp(),
        modifiedBy: f.valuesFromArray({ values: ['admin12345678' ] }),
      },
      count: PAGES_COUNT,
    }
  }))
  .then(() => {
    console.info(` \n✅ Created ${PAGES_COUNT} pages\n `);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
