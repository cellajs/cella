import { faker } from '@faker-js/faker';
import { UniqueEnforcer } from 'enforce-unique';
import { Argon2id } from 'oslo/password';

import { db } from '../src/db/db';
import { InsertMembershipModel, InsertOrganizationModel, InsertUserModel, membershipsTable, organizationsTable, usersTable } from '../src/db/schema';
import { nanoid } from '../src/lib/nanoid';

const organizationsUniqueEnforcer = new UniqueEnforcer();

const organizations: (InsertOrganizationModel & {
  id: string;
})[] = Array.from({
  length: 100,
}).map(() => {
  const name = organizationsUniqueEnforcer.enforce(() => faker.company.name());

  return {
    id: nanoid(),
    name,
    slug: faker.helpers.slugify(name).toLowerCase(),
    bannerUrl: faker.image.url(),
    brandColor: faker.internet.color(),
    chatSupport: faker.datatype.boolean(),
    country: faker.location.country(),
    createdAt: faker.date.past(),
    logoUrl: faker.image.url(),
    thumbnailUrl: faker.image.url(),
  };
});

await db.insert(organizationsTable).values(organizations);

console.log('Created organizations');

const hashedPassword = await new Argon2id().hash('12345678');

const usersSlugUniqueEnforcer = new UniqueEnforcer();
const usersEmailUniqueEnforcer = new UniqueEnforcer();

for (const organization of organizations) {
  const insertUsers: InsertUserModel[] = Array.from({ length: 100 }).map(() => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const name = faker.person.fullName({
      firstName,
      lastName,
    });
    const email = usersEmailUniqueEnforcer.enforce(() =>
      faker.internet
        .email({
          firstName,
          lastName,
        })
        .toLocaleLowerCase(),
    );
    const slug = usersSlugUniqueEnforcer.enforce(() =>
      faker.internet
        .userName({
          firstName,
          lastName,
        })
        .toLowerCase(),
    );

    return {
      id: nanoid(),
      firstName,
      lastName,
      name,
      email,
      hashedPassword,
      slug,
      avatarUrl: faker.image.avatar(),
      createdAt: faker.date.past(),
    };
  });

  const users = await db.insert(usersTable).values(insertUsers).returning();

  const memberships: InsertMembershipModel[] = users.map((user) => {
    return {
      userId: user.id,
      organizationId: organization.id,
      role: faker.helpers.arrayElement(['ADMIN', 'MEMBER']),
      createdAt: faker.date.past(),
    };
  });

  await db.insert(membershipsTable).values(memberships);
}

console.log('Created users and memberships');

process.exit(0);
