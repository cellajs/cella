import { faker } from '@faker-js/faker';
import chalk from 'chalk';

import { config } from 'config';
import { UniqueEnforcer } from 'enforce-unique';
import slugify from 'slugify';
import { db } from '#/db/db';
import { emailsTable, type InsertEmailModel } from '#/db/schema/emails';
import { type InsertMembershipModel, membershipsTable } from '#/db/schema/memberships';
import { type InsertOrganizationModel, organizationsTable } from '#/db/schema/organizations';
import { type InsertUserModel, usersTable } from '#/db/schema/users';
import { hashPassword } from '#/modules/auth/helpers/argon2id';
import { generateUnsubscribeToken } from '#/modules/users/helpers/unsubscribe-token';
import { nanoid } from '#/utils/nanoid';
import { adminUser } from '../user/seed';

const ORGANIZATIONS_COUNT = 100;
const MEMBERS_COUNT = 100;
const SYSTEM_ADMIN_MEMBERSHIP_COUNT = 10;

const pastIsoDate = () => faker.date.past().toISOString();

// Seed organizations with data
export const organizationsSeed = async () => {
  console.info(' ');
  console.info('◔ Seeding organizations...');

  const organizationsInTable = await db.select().from(organizationsTable).limit(1);

  if (organizationsInTable.length > 0) return console.warn('Organizations table is not empty, skipping seed');

  const organizationsUniqueEnforcer = new UniqueEnforcer();

  const organizations: (InsertOrganizationModel & {
    id: string;
  })[] = Array.from({
    length: ORGANIZATIONS_COUNT,
  }).map(() => {
    const name = organizationsUniqueEnforcer.enforce(() => faker.company.name());

    return {
      id: nanoid(),
      name,
      slug: slugify(name, { lower: true, strict: true }),
      bannerUrl: null,
      color: faker.color.rgb(),
      chatSupport: faker.datatype.boolean(),
      country: faker.location.country(),
      createdAt: pastIsoDate(),
      logoUrl: faker.image.url(),
      thumbnailUrl: null,
    };
  });

  await db.insert(organizationsTable).values(organizations).onConflictDoNothing();
  console.info(' ');
  console.info('◔ Seeding members and memberships, this can take a while...');

  const hashedPassword = await hashPassword('12345678');

  const usersSlugUniqueEnforcer = new UniqueEnforcer();
  const usersEmailUniqueEnforcer = new UniqueEnforcer();

  let usersCount = 0;
  let organizationsCount = 0;
  let membershipsCount = 0;
  let adminMembershipsOrder = 1;
  let adminOrganizationsCount = 0;

  // Create 100 users for each organization
  for (const organization of organizations) {
    organizationsCount++;

    const insertUsers: InsertUserModel[] = Array.from({ length: MEMBERS_COUNT }).map(() => {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const firstAndLastName = { firstName, lastName };

      const name = faker.person.fullName(firstAndLastName);
      const email = usersEmailUniqueEnforcer.enforce(() => faker.internet.email(firstAndLastName).toLocaleLowerCase());
      const slug = usersSlugUniqueEnforcer.enforce(() => slugify(faker.internet.username(firstAndLastName), { lower: true, strict: true }), {
        maxTime: 500,
        maxRetries: 500,
      });

      return {
        id: nanoid(),
        firstName,
        lastName,
        thumbnailUrl: null,
        language: config.defaultLanguage,
        name,
        email,
        unsubscribeToken: generateUnsubscribeToken(email),
        hashedPassword,
        slug,
        avatarUrl: null,
        newsletter: faker.datatype.boolean(),
        createdAt: pastIsoDate(),
      };
    });

    usersCount += insertUsers.length;

    const users = await db.insert(usersTable).values(insertUsers).returning().onConflictDoNothing();

    const insertUsersEmails: InsertEmailModel[] = users.map((user) => ({
      email: user.email,
      userId: user.id,
      verified: true,
      verifiedAt: faker.date.past().toISOString(),
    }));
    await db.insert(emailsTable).values(insertUsersEmails).onConflictDoNothing();

    // Create 100 memberships for each organization
    const memberships: InsertMembershipModel[] = users.map((user) => {
      return {
        id: nanoid(),
        userId: user.id,
        organizationId: organization.id,
        contextType: 'organization',
        role: faker.helpers.arrayElement(['admin', 'member']),
        createdAt: pastIsoDate(),
        order: organizationsCount * 10,
        activatedAt: pastIsoDate(),
      };
    });

    // Loop over organizations

    // Add Admin user to every even organization, but limit to a certain number
    if (organizationsCount % 2 === 0 && adminOrganizationsCount < SYSTEM_ADMIN_MEMBERSHIP_COUNT) {
      memberships.push({
        id: nanoid(),
        userId: adminUser.id,
        organizationId: organization.id,
        contextType: 'organization',
        archived: faker.datatype.boolean(0.5),
        role: faker.helpers.arrayElement(['admin', 'member']),
        createdAt: pastIsoDate(),
        order: adminMembershipsOrder,
        activatedAt: pastIsoDate(),
      });
      adminMembershipsOrder = adminMembershipsOrder + 10;
      adminOrganizationsCount++; // Increment the counter
    }

    membershipsCount += memberships.length;

    await db.insert(membershipsTable).values(memberships).onConflictDoNothing();
  }

  console.info(' ');
  console.info(`${chalk.greenBright.bold('✔')} Created ${ORGANIZATIONS_COUNT} organizations with ${MEMBERS_COUNT} members each`);
  console.info(' ');
};
