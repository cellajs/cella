import { faker } from '@faker-js/faker';
import { db as mainDb } from 'backend/db/db';
import { organizationsTable } from 'backend/db/schema/organizations';
// import { db as electricDb } from '../src/db/db';
import type { InsertWorkspaceModel } from 'backend/db/schema/workspaces';

const main = async () => {
  const organizations = await mainDb.select().from(organizationsTable);

  const insertWorkspaces: InsertWorkspaceModel[] = [];
  for (const organization of organizations) {
    insertWorkspaces.push({
      name: faker.company.buzzNoun(),
      organizationId: organization.id,
      slug: faker.helpers.slugify(faker.company.buzzNoun()),
    });
  }
};

main().catch((error) => {
  console.error(error);
});
