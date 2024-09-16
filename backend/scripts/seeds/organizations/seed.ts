import { faker } from '@faker-js/faker';
import { UniqueEnforcer } from 'enforce-unique';

import { Command } from '@commander-js/extra-typings';
import { config } from 'config';
import { db } from '#/db/db';
import { nanoid } from '#/lib/nanoid';

import { type InsertMembershipModel, membershipsTable } from '#/db/schema/memberships';
import { type InsertOrganizationModel, organizationsTable } from '#/db/schema/organizations';
import { type InsertUserModel, usersTable } from '#/db/schema/users';
import { hashPasswordWithArgon } from '#/lib/argon2id';
import { generateUnsubscribeToken } from '#/lib/unsubscribe-token';
import type { Status } from '../progress';
import { adminUser } from '../user/seed';

const seedCommand = new Command().option('--addImages', 'Add images to org').parse(process.argv);
const options = seedCommand.opts();

// Seed organizations with data
export const organizationsSeed = async (progressCallback?: (stage: string, count: number, status: Status) => void) => {
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
      bannerUrl: options.addImages ? faker.image.url() : null,
      color: faker.internet.color(),
      chatSupport: faker.datatype.boolean(),
      country: faker.location.country(),
      createdAt: faker.date.past(),
      logoUrl: faker.image.url(),
      thumbnailUrl: options.addImages ? faker.image.url() : null,
    };
  });

  await db.insert(organizationsTable).values(organizations).onConflictDoNothing();

  const hashedPassword = await hashPasswordWithArgon('12345678');

  const usersSlugUniqueEnforcer = new UniqueEnforcer();
  const usersEmailUniqueEnforcer = new UniqueEnforcer();

  let usersCount = 0;
  let organizationsCount = 0;
  let membershipsCount = 0;
  let adminMembershipsOrder = 1;

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
      const slug = usersSlugUniqueEnforcer.enforce(
        () =>
          faker.internet
            .userName(firstAndLastName)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-'),
        {
          maxTime: 500,
          maxRetries: 500,
        },
      );

      return {
        id: nanoid(),
        firstName,
        lastName,
        thumbnailUrl: options.addImages ? faker.image.avatar() : null,
        language: config.defaultLanguage,
        name,
        email,
        unsubscribeToken: generateUnsubscribeToken(email),
        hashedPassword,
        slug,
        avatarUrl: options.addImages ? faker.image.avatar() : null,
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
        type: 'organization',
        role: faker.helpers.arrayElement(['admin', 'member']),
        createdAt: faker.date.past(),
        order: organizationsCount + 1,
      };
    });

    // add Admin user to every even organization
    if (organizationsCount % 2 === 0) {
      memberships.push({
        id: nanoid(),
        userId: adminUser.id,
        organizationId: organization.id,
        type: 'organization',
        role: faker.helpers.arrayElement(['admin', 'member']),
        createdAt: faker.date.past(),
        order: adminMembershipsOrder,
      });
      adminMembershipsOrder++;
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
