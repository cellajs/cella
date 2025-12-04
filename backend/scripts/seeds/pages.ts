import { db } from '#/db/db';
import { pagesTable } from '#/db/schema/pages';
import { seed } from "drizzle-seed";

const PAGES_COUNT = 10;
const ADMIN_ID = 'admin12345678';
const LOREM_IPSUM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

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
        content: f.default({ 
          defaultValue: JSON.stringify([{
            content: [{ type: "text", text: LOREM_IPSUM, styles: {} }],
            children: [],
          }]),
        }),
        keywords: f.valuesFromArray({ values: ['test-tag'] }),
        status: f.default({ defaultValue: 'unpublished' }),
        parentId: f.default({ defaultValue: undefined }),
        displayOrder: f.default({ defaultValue: 0 }),
        createdAt: f.timestamp(),
        createdBy: f.default({ defaultValue: ADMIN_ID }),
        modifiedAt: f.timestamp(),
        modifiedBy: f.default({ defaultValue: ADMIN_ID }),
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
