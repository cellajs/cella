import { faker } from '@faker-js/faker';
import { eq } from 'drizzle-orm';
import { startSpinner, succeedSpinner, warnSpinner } from '#/utils/console';

import { migrationDb } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { InsertMembershipModel, membershipsTable } from '#/db/schema/memberships';
import { OrganizationModel, organizationsTable } from '#/db/schema/organizations';
import { passwordsTable } from '#/db/schema/passwords';
import { tenantsTable } from '#/db/schema/tenants';
import { unsubscribeTokensTable } from '#/db/schema/unsubscribe-tokens';
import { UserModel, usersTable } from '#/db/schema/users';
import { hashPassword } from '#/modules/auth/passwords/helpers/argon2id';
import { getMembershipOrderOffset, mockContextMembership } from '../../../mocks/mock-membership';
import { mockOrganization } from '../../../mocks/mock-organization';
import { mockEmail, mockPassword, mockUnsubscribeToken, mockUser } from '../../../mocks/mock-user';
import { mockMany, setMockContext } from '../../../mocks/utils';
import { defaultAdminUser } from '../fixtures';

// Set mock context for seed script - IDs will get 'gen-' prefix (CDC worker skips these)
setMockContext('script');

// Seed scripts use admin connection (migrationDb) for privileged operations
const db = migrationDb;

const isProduction = process.env.NODE_ENV === 'production';

const TENANTS_COUNT = 10;
const ORGANIZATIONS_PER_TENANT = 10;
const MEMBERS_COUNT = 100;
const SYSTEM_ADMIN_MEMBERSHIP_COUNT = 10;
export const PLAIN_USER_PASSWORD = '12345678';

const isOrganizationSeeded = async () => {
  if (!db) return true; // Skip if no admin connection
  const organizationsInTable = await db
    .select()
    .from(organizationsTable)
    .limit(1);

  return organizationsInTable.length > 0;
};

// Seed organizations with data
export const organizationsSeed = async () => {
  if (isProduction) return console.error('Not allowed in production.');

  // Admin connection required
  if (!db) return console.error('DATABASE_ADMIN_URL required for seeding');

  const spinner = startSpinner('Seeding organizations...');

  // Records already exist → skip seeding
  if (await isOrganizationSeeded()) {
    warnSpinner('Organizations table not empty → skip seeding');
    return;
  }

  // Create tenants (10 tenants, each will have 10 organizations)
  const tenantRecords = Array.from({ length: TENANTS_COUNT }, (_, i) => ({
    name: `Tenant ${i + 1}`,
  }));
  const tenants = await db
    .insert(tenantsTable)
    .values(tenantRecords)
    .returning()
    .onConflictDoNothing();

  // Make organizations - distribute across tenants (10 per tenant)
  // Set createdBy to admin so system admin can access all orgs via RLS (createdBy match)
  const organizationRecords = mockMany(mockOrganization, TENANTS_COUNT * ORGANIZATIONS_PER_TENANT).map((org, i) => ({
    ...org,
    tenantId: tenants[Math.floor(i / ORGANIZATIONS_PER_TENANT)].id, // Assign 10 orgs per tenant
    createdBy: defaultAdminUser.id,
  }));
  const organizations = await db
    .insert(organizationsTable)
    .values(organizationRecords)
    .returning()
    .onConflictDoNothing();

  spinner.text = 'Seeding members and memberships...';

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

    const membershipRecords = users.map(user => mockContextMembership('organization', organization, user));

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

  succeedSpinner(`Created ${TENANTS_COUNT} tenants with ${ORGANIZATIONS_PER_TENANT} organizations each (${TENANTS_COUNT * ORGANIZATIONS_PER_TENANT} total), ${MEMBERS_COUNT} members per org`);
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
  const membership = mockContextMembership('organization', organization, adminUser);

  // Adjust the admin membership
  membership.archived = faker.datatype.boolean(0.5);
  membership.displayOrder = 1 + adminMemberships.length * 10;

  // Add admin membership to the list
  adminMemberships.push(membership);
}
