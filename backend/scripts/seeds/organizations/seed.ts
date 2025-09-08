import { faker } from '@faker-js/faker';
import chalk from 'chalk';
import { eq } from 'drizzle-orm';

import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { InsertMembershipModel, membershipsTable } from '#/db/schema/memberships';
import { OrganizationModel, organizationsTable } from '#/db/schema/organizations';
import { passwordsTable } from '#/db/schema/passwords';
import { unsubscribeTokensTable } from '#/db/schema/unsubscribe-tokens';
import { UserModel, usersTable } from '#/db/schema/users';
import { hashPassword } from '#/modules/auth/helpers/argon2id';
import { getMembershipOrderOffset, mockEmail, mockMany, mockOrganization, mockOrganizationMembership, mockPassword, mockUnsubscribeToken, mockUser } from '../../../mocks/basic';
import { defaultAdminUser } from '../fixtures';
import { isOrganizationSeeded as isAlreadySeeded } from '../utils';

const ORGANIZATIONS_COUNT = 100;
const MEMBERS_COUNT = 100;
const SYSTEM_ADMIN_MEMBERSHIP_COUNT = 10;
export const PLAIN_USER_PASSWORD = '12345678';

// Seed organizations with data
export const organizationsSeed = async () => {
  console.info(' \n◔ Seeding organizations...');

  // Case: Records already exist → skip seeding
  if (await isAlreadySeeded()) return console.warn('Organizations table not empty → skip seeding');

  // Make many organizations → Insert into the database
  const organizationRecords = mockMany(mockOrganization, ORGANIZATIONS_COUNT);
  const organizations = await db
    .insert(organizationsTable)
    .values(organizationRecords)
    .returning()
    .onConflictDoNothing();

  console.info(' \n◔ Seeding members and memberships, this can take a while...');

  // Fetch the default admin user
  const [adminUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, defaultAdminUser.id))
    .limit(1);

  const adminMemberships: InsertMembershipModel[] = [];
  const hashed = await hashPassword(PLAIN_USER_PASSWORD);

  for (const organization of organizations) {
    // Make many users → Insert into the database
    const userRecords = mockMany(() => mockUser(), MEMBERS_COUNT);
    const users = await db
      .insert(usersTable)
      .values(userRecords)
      .returning()
      .onConflictDoNothing();
      
   // Make password record for each user → Insert into the database
    const passwordRecords = users.map(user => mockPassword(user, hashed));
    await db.insert(passwordsTable).values(passwordRecords).onConflictDoNothing();


    // Make unsubscribeToken record for each user → Insert into the database
    const unsubscribeTokenRecords = users.map(user => mockUnsubscribeToken(user));
    await db.insert(unsubscribeTokensTable).values(unsubscribeTokenRecords).onConflictDoNothing();


    // Make email record for each user → Insert into the database
    const emailRecords = users.map(mockEmail);
    await db
      .insert(emailsTable)
      .values(emailRecords)
      .onConflictDoNothing();

    const membershipRecords = users.map(user => mockOrganizationMembership(organization, user));

    // Insert memberships into the database
    await db
      .insert(membershipsTable)
      .values(membershipRecords)
      .onConflictDoNothing();

    // Add admin membership if the organization is in an even position
    addAdminMembership(
      adminUser,
      organization,
      adminMemberships,
    );
  }

  // Insert admin memberships into the database
  if (adminMemberships.length) {
    await db
      .insert(membershipsTable)
      .values(adminMemberships)
      .onConflictDoNothing();
  }

  console.info(` \n${chalk.greenBright.bold('✔')} Created ${ORGANIZATIONS_COUNT} organizations with ${MEMBERS_COUNT} members each\n `);
};

/**
 * Adds an admin membership to `adminMemberships`.
 * Conditions for adding:
 * - The organization must be in an even position.
 * - The number of existing admin memberships must be less than the system-defined limit.
 *
 * The function mutates the `adminMemberships` array by pushing a new, adjusted membership.
 *
 * @param adminUser - The admin user to assign the membership to.
 * @param organization - The organization the admin should be added to.
 * @param adminMemberships - An array tracking admin memberships already created.
 */
const addAdminMembership = (
  adminUser: UserModel,
  organization: OrganizationModel,
  adminMemberships: InsertMembershipModel[]
) => {
  // Case: Organization is not in an even position → skip admin membership
  if (getMembershipOrderOffset(organization.id) % 2 !== 0) return;

  // Case: Exceeded the system admin membership count → skip admin membership
  if (adminMemberships.length >= SYSTEM_ADMIN_MEMBERSHIP_COUNT) return;

  // Make admin membership
  const membership = mockOrganizationMembership(organization, adminUser);

  // Adjust the admin membership
  membership.archived = faker.datatype.boolean(0.5);
  membership.order = 1 + adminMemberships.length * 10;

  // Add admin membership to the list
  adminMemberships.push(membership);
}
