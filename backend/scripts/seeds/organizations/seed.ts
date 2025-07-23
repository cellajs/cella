import { faker } from '@faker-js/faker';
import chalk from 'chalk';
import { eq } from 'drizzle-orm';

import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { InsertMembershipModel, membershipsTable } from '#/db/schema/memberships';
import { OrganizationModel, organizationsTable } from '#/db/schema/organizations';
import { UserModel, usersTable } from '#/db/schema/users';
import { defaultAdminUser } from '../common/admin';
import { OrganizationSeeder } from '../common/organization-seeder';
import { UserSeeder } from '../common/user-seeder';
import { OrganizationMembershipSeeder } from '../common/membership-seeder';
import { EmailSeeder } from '../common/email-seeder';
import { isOrganizationAlreadySeeded as isAlreadySeeded } from '../common/is-already-seeded';

const ORGANIZATIONS_COUNT = 100;
const MEMBERS_COUNT = 100;
const SYSTEM_ADMIN_MEMBERSHIP_COUNT = 10;

// Seed organizations with data
export const organizationsSeed = async () => {
  console.info(' \n◔ Seeding organizations...');

  // Case: Records already exist → skip seeding
  if (await isAlreadySeeded()) return console.warn('Organizations table not empty → skip seeding');

  // Make many organizations → Insert into the database
  const organizationSeeder = new OrganizationSeeder();
  const organizationRecords = organizationSeeder.makeMany(ORGANIZATIONS_COUNT);

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

  for (const organization of organizations) {
    // Make many users → Insert into the database
    const userSeeder = await UserSeeder.init(); // use initialize for default hashed password
    const userRecords = userSeeder.makeMany(MEMBERS_COUNT);

    const users = await db
      .insert(usersTable)
      .values(userRecords)
      .returning()
      .onConflictDoNothing();

    // Make email record for each user → Insert into the database
    const emailSeeder = new EmailSeeder();
    const emailRecords = emailSeeder.makeMany(users);

    await db
      .insert(emailsTable)
      .values(emailRecords)
      .onConflictDoNothing();

    // Make membership for each user
    const membershipSeeder = new OrganizationMembershipSeeder();
    const memberships = membershipSeeder.makeMany(users, organization);

    // Insert memberships into the database
    await db
      .insert(membershipsTable)
      .values(memberships)
      .onConflictDoNothing();

    // Add admin membership if the organization is in an even position
    addAdminMembership(
      adminUser,
      membershipSeeder,
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
 * Adds an admin membership to the provided list if the organization qualifies.
 *
 * Conditions for adding:
 * - The organization must be in an even position (as determined by the seeder).
 * - The number of existing admin memberships must be less than the system-defined limit.
 *
 * The function mutates the `adminMemberships` array by pushing a new, adjusted membership.
 *
 * @param adminUser - The admin user to assign the membership to.
 * @param membershipSeeder - Seeder used to generate the membership record.
 * @param organization - The organization the admin should be added to.
 * @param adminMemberships - An array tracking admin memberships already created.
 */
const addAdminMembership = (
  adminUser: UserModel,
  membershipSeeder: OrganizationMembershipSeeder,
  organization: OrganizationModel,
  adminMemberships: InsertMembershipModel[]
) => {
  // Case: Organization is not in an even position → skip admin membership
  if (!membershipSeeder.isEvenOrder(organization.id)) return;

  // Case: Exceeded the system admin membership count → skip admin membership
  if (adminMemberships.length >= SYSTEM_ADMIN_MEMBERSHIP_COUNT) return; 
    
  // Make admin membership
  const membership = membershipSeeder.make(adminUser, organization);

  // Adjust the admin membership
  membership.archived = faker.datatype.boolean(0.5);
  membership.order = 1 + adminMemberships.length * 10;

  // Add admin membership to the list
  adminMemberships.push(membership);
}
