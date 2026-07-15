import type { SeedScript } from '../types';
import { faker } from '@faker-js/faker';
import { eq } from 'drizzle-orm';
import { startSpinner, succeedSpinner, warnSpinner } from '#/utils/console';

import { seedDb } from '#/db/db';
import { domainsTable } from '#/modules/domains/domains-db';
import { emailsTable } from '#/modules/user/emails-db';
import { InsertMembershipModel, membershipsTable } from '#/modules/memberships/memberships-db';
import { OrganizationModel, organizationsTable } from '#/modules/organization/organization-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { unsubscribeTokensTable } from '#/modules/user/unsubscribe-tokens-db';
import { UserModel, usersTable } from '#/modules/user/user-db';
import { getMembershipOrderOffset, mockChannelMembership } from '#/modules/memberships/memberships-mocks';
import { mockOrganization } from '#/modules/organization/organization-mocks';
import { mockEmail, mockUnsubscribeToken, mockUser } from '#/modules/user/user-mocks';
import { mockMany, setMockContext } from '#/mocks';
import { defaultAdminUser } from '../fixtures';

// Set mock context for seed script - UUIDs get '00000000-' prefix, nanoids get 'gen-' prefix (CDC worker skips these on catch-up)
setMockContext('script');

// Seed scripts use admin connection for privileged operations
const db = seedDb;

// 1 tenant = 1 organization. One org per tenant; keep ~100 orgs by using 100 tenants.
const TENANTS_COUNT = 100;
const ORGANIZATIONS_PER_TENANT = 1;
const MEMBERS_COUNT = 100;
const SYSTEM_ADMIN_MEMBERSHIP_COUNT = 10;

const isOrganizationSeeded = async () => {
  const organizationsInTable = await db
    .select()
    .from(organizationsTable)
    .limit(1);

  return organizationsInTable.length > 0;
};

// Seed organizations with data
export const organizationsSeed = async () => {
  const spinner = startSpinner('Seeding organizations...');

  // Records already exist → skip seeding
  if (await isOrganizationSeeded()) {
    warnSpinner('Organizations table not empty → skip seeding');
    return;
  }

  // Create tenants (one organization each, per the 1 tenant = 1 org invariant)
  const tenantRecords = Array.from({ length: TENANTS_COUNT }, (_, i) => ({
    name: `Tenant ${i + 1}`,
    createdBy: defaultAdminUser.id,
    // Give first 2 tenants an active subscription for dev testing
    ...(i < 2 && {
      subscriptionId: `sub_seed_${i + 1}`,
      subscriptionStatus: 'active' as const,
      subscriptionPlan: 'pro',
    }),
  }));
  const tenants = await db
    .insert(tenantsTable)
    .values(tenantRecords)
    .returning()
    .onConflictDoNothing();

  // Seed domains for tenants (one domain per tenant for email matching)
  const domainRecords = tenants.map((tenant, i) => ({
    tenantId: tenant.id,
    domain: `tenant${i + 1}.example`,
    verified: i < 3, // First 3 tenants have verified domains
  }));
  await db.insert(domainsTable).values(domainRecords).onConflictDoNothing();

  // Make organizations - one per tenant (1 tenant = 1 org)
  // Set createdBy to admin so system admin can access all orgs via RLS (createdBy match)
  const organizationRecords = mockMany(mockOrganization, TENANTS_COUNT * ORGANIZATIONS_PER_TENANT).map((org, i) => ({
    ...org,
    tenantId: tenants[Math.floor(i / ORGANIZATIONS_PER_TENANT)].id, // one org per tenant
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

  for (const organization of organizations) {
    // Make many users → Insert into the database
    const userRecords = mockMany(() => mockUser(), MEMBERS_COUNT);
    const users = await db
      .insert(usersTable)
      .values(userRecords)
      .returning()
      .onConflictDoNothing();

    // Make unsubscribeToken row for each user, then insert into the database
    const unsubscribeTokenRecords = await Promise.all(users.map(user => mockUnsubscribeToken(user)));
    await db.insert(unsubscribeTokensTable).values(unsubscribeTokenRecords).onConflictDoNothing();


    // Make email row for each user, then insert into the database
    const emailRecords = users.map(mockEmail);
    await db
      .insert(emailsTable)
      .values(emailRecords)
      .onConflictDoNothing();

    const membershipRecords = users.map(user => mockChannelMembership('organization', organization, user));

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

  succeedSpinner(`Created ${TENANTS_COUNT} tenants, one organization each (${TENANTS_COUNT * ORGANIZATIONS_PER_TENANT} total), ${MEMBERS_COUNT} members per org`);
};

/**
 * Push an admin membership onto `adminMemberships` (mutates it), but only when the organization
 * is in an even position AND the existing admin-membership count is below the system limit.
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
  const membership = mockChannelMembership('organization', organization, adminUser);

  // Adjust the admin membership
  membership.archived = faker.datatype.boolean(0.5);
  membership.displayOrder = 1 + adminMemberships.length * 10;

  // Add admin membership to the list
  adminMemberships.push(membership);
}

export const seedConfig: SeedScript = { name: 'organizations', run: organizationsSeed };
