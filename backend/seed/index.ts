import { faker } from '@faker-js/faker';
import { UniqueEnforcer } from 'enforce-unique';
import { Argon2id } from 'oslo/password';

import { config } from 'config';
import { db } from '../src/db/db';
import { nanoid } from '../src/lib/nanoid';
import type { Stage, Status } from './organizations';

import { membershipsTable, type InsertMembershipModel } from '../src/db/schema/memberships';
import { organizationsTable, type InsertOrganizationModel } from '../src/db/schema/organizations';
import { usersTable, type InsertUserModel } from '../src/db/schema/users';

// Seed an admin user to access app first time
export const userSeed = async () => {
  const usersInTable = await db.select().from(usersTable).limit(1);

  if (usersInTable.length > 0) {
    console.info('Users table is not empty, skipping seed');
    return;
  }
  const password = '12345678';
  const hashedPassword = await new Argon2id().hash(password);
  const email = 'admin-test@cellajs.com';
  const adminId = 'admin12345678';

  await db
    .insert(usersTable)
    .values({
      id: adminId,
      email,
      emailVerified: true,
      name: 'Admin User',
      language: config.defaultLanguage,
      slug: 'admin-user',
      role: 'ADMIN',
      hashedPassword,
    })
    .onConflictDoNothing();

  console.info(`Created admin user with verified email ${email} and password ${password}.`);
};

// Seed organizations with data
export const organizationsSeed = async (progressCallback?: (stage: Stage, count: number, status: Status) => void) => {
  const organizationsInTable = await db.select().from(organizationsTable).limit(1);

  if (organizationsInTable.length > 0) {
    console.info('Organizations table is not empty, skipping seed');
    return;
  }

  const organizationsUniqueEnforcer = new UniqueEnforcer();

  const organizations: (InsertOrganizationModel & {
    id: string;
  })[] = Array.from({
    length: 10,
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

  const hashedPassword = await new Argon2id().hash('12345678');

  const usersSlugUniqueEnforcer = new UniqueEnforcer();
  const usersEmailUniqueEnforcer = new UniqueEnforcer();

  let usersCount = 0;
  let organizationsCount = 0;
  let membershipsCount = 0;

  // Create 100 users for each organization
  for (const organization of organizations) {
    organizationsCount++;
    if (progressCallback) progressCallback('organizations', organizationsCount, 'inserting');

    const insertUsers: InsertUserModel[] = Array.from({ length: 100 }).map(() => {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const firstAndLastName = { firstName, lastName };

      const name = faker.person.fullName(firstAndLastName);
      const email = usersEmailUniqueEnforcer.enforce(() => faker.internet.email(firstAndLastName).toLocaleLowerCase());
      const slug = usersSlugUniqueEnforcer.enforce(() =>
        faker.internet
          .userName(firstAndLastName)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-'),
      );

      return {
        id: nanoid(),
        firstName,
        lastName,
        thumbnailUrl: faker.image.avatar(),
        language: config.defaultLanguage,
        name,
        email,
        hashedPassword,
        slug,
        avatarUrl: faker.image.avatar(),
        createdAt: faker.date.past(),
      };
    });

    usersCount += insertUsers.length;
    if (progressCallback) progressCallback('users', usersCount, 'inserting');

    const users = await db.insert(usersTable).values(insertUsers).returning().onConflictDoNothing();

    // Create 100 memberships for each organization
    const memberships: InsertMembershipModel[] = users.map((user) => {
      return {
        id: nanoid(),
        userId: user.id,
        organizationId: organization.id,
        role: faker.helpers.arrayElement(['ADMIN', 'MEMBER']),
        createdAt: faker.date.past(),
      };
    });

    // add Admin user to every even organization
    if (organizationsCount % 2 === 0) {
      memberships.push({
        id: nanoid(),
        userId: 'admin12345678',
        organizationId: organization.id,
        role: faker.helpers.arrayElement(['ADMIN', 'MEMBER']),
        createdAt: faker.date.past(),
      });
    }
    membershipsCount += memberships.length;
    if (progressCallback) progressCallback('memberships', membershipsCount, 'inserting');

    await db.insert(membershipsTable).values(memberships).onConflictDoNothing();
  }

  if (progressCallback) {
    progressCallback('memberships', membershipsCount, 'done');
    progressCallback('users', usersCount, 'done');
    progressCallback('organizations', organizationsCount, 'done');
  }
};
