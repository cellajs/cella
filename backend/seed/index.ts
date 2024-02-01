import { faker } from '@faker-js/faker';
import { UniqueEnforcer } from 'enforce-unique';
import { Argon2id } from 'oslo/password';

import { config } from 'config';
import { db } from '../src/db/db';
import { InsertMembershipModel, InsertOrganizationModel, InsertUserModel, membershipsTable, organizationsTable, usersTable } from '../src/db/schema';
import { nanoid } from '../src/lib/nanoid';

// Seed an admin user to access app first time
export const usersSeed = async () => {
  const usersInTable = await db.select().from(usersTable).limit(1);

  if (usersInTable.length > 0) {
    console.log('Users table is not empty, skipping seed');
    return;
  }
  const hashedPassword = await new Argon2id().hash('12345678');
  const email = 'admin-test@cellajs.com';

  await db
    .insert(usersTable)
    .values({
      id: nanoid(),
      email,
      emailVerified: true,
      language: config.defaultLanguage,
      slug: 'admin-user',
      role: 'ADMIN',
      hashedPassword,
    })
    .onConflictDoNothing();

  console.log(`Created admin user with verified email ${email} and password ${hashedPassword}.`);
};

// Seed 100 organizations with 100 members each
export const organizationsAndMembersSeed = async () => {
  const organizationsInTable = await db.select().from(organizationsTable).limit(1);

  if (organizationsInTable.length > 0) {
    console.log('Organizations table is not empty, skipping seed');
    return;
  }

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

  await db.insert(organizationsTable).values(organizations).onConflictDoNothing();

  console.log('Create 100 organizations successfully.');

  const hashedPassword = await new Argon2id().hash('12345678');

  const usersSlugUniqueEnforcer = new UniqueEnforcer();
  const usersEmailUniqueEnforcer = new UniqueEnforcer();

  // Create 100 users for each organization
  for (const organization of organizations) {
    const insertUsers: InsertUserModel[] = Array.from({ length: 100 }).map(() => {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const firstAndLastName = { firstName, lastName };

      const name = faker.person.fullName(firstAndLastName);
      const email = usersEmailUniqueEnforcer.enforce(() => faker.internet.email(firstAndLastName).toLocaleLowerCase());
      const slug = usersSlugUniqueEnforcer.enforce(() => faker.internet.userName(firstAndLastName).toLowerCase());

      return {
        id: nanoid(),
        firstName,
        lastName,
        language: config.defaultLanguage,
        name,
        email,
        hashedPassword,
        slug,
        avatarUrl: faker.image.avatar(),
        createdAt: faker.date.past(),
      };
    });

    const users = await db.insert(usersTable).values(insertUsers).returning().onConflictDoNothing();

    // Create 100 memberships for each organization
    const memberships: InsertMembershipModel[] = users.map((user) => {
      return {
        userId: user.id,
        organizationId: organization.id,
        role: faker.helpers.arrayElement(['ADMIN', 'MEMBER']),
        createdAt: faker.date.past(),
      };
    });

    await db.insert(membershipsTable).values(memberships).onConflictDoNothing();
  }

  console.log('Seed with organizations, members and memberships completed!');
};
