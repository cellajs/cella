import { InsertEmailModel } from "#/db/schema/emails";
import { InsertMembershipModel } from "#/db/schema/memberships";
import { InsertOrganizationModel, OrganizationModel } from "#/db/schema/organizations";
import { InsertPasswordModel } from "#/db/schema/passwords";
import { InsertUnsubscribeTokenModel } from "#/db/schema/unsubscribe-tokens";
import { InsertUserModel, UserModel } from "#/db/schema/users";
import { nanoid } from "#/utils/nanoid";
import { generateUnsubscribeToken } from "#/utils/unsubscribe-token";
import { faker } from "@faker-js/faker";
import { appConfig } from "config";
import { UniqueEnforcer } from "enforce-unique";
import slugify from "slugify";
import { pastIsoDate } from "./utils";

/**
 * Type: Optional overrides for mock user generation.
 * Allows customization of specific fields while keeping others random.
 */
type MockUserOptionalOverrides = Partial<{
  email: string;
}>;

// Enforces uniqueness 
const organizationName = new UniqueEnforcer();
const userSlug = new UniqueEnforcer();
const userEmail = new UniqueEnforcer();

// Tracks the current order offset for memberships per context
const membershipOrderMap: Map<string, number> = new Map();

/**
 * Returns a unique order offset for a given context (e.g., organization ID).
 * Ensures incremental order values for memberships within the same context.
 * 
 * @param contextId - Unique identifier for the context (typically organization ID).
 * @returns The current offset value (starting from 1), multiplied by 10 elsewhere.
 */
export const getMembershipOrderOffset = (contextId: string): number => {
  if (!membershipOrderMap.has(contextId)) {
    membershipOrderMap.set(contextId, membershipOrderMap.size + 1);
  }
  return membershipOrderMap.get(contextId)!;
}

/**
 * Generates a mock organization record with realistic values.
 * Enforces unique organization names.
 *
 * @returns A valid InsertOrganizationModel object.
 */
export const mockOrganization = (): InsertOrganizationModel => {
  const name = organizationName.enforce(() => faker.company.name());

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
};

/**
 * Generates a mock user with a given hashed password.
 * Enforces unique email and slug.
 *
 * @param hashedPassword - Pre-generated hashed password to assign to the user.
 * @returns A valid InsertUserModel object.
 */
export const mockUser = (overrides: MockUserOptionalOverrides = {}): InsertUserModel => {
  const firstAndLastName = { firstName: faker.person.firstName(), lastName: faker.person.lastName() };
  const email = overrides.email ?? userEmail.enforce(() => faker.internet.email(firstAndLastName).toLowerCase());
  const slug = userSlug.enforce(() => slugify(faker.internet.username(firstAndLastName), { lower: true, strict: true }), { maxTime: 500, maxRetries: 500 })

  return {
    id: nanoid(),
    firstName: firstAndLastName.firstName,
    lastName: firstAndLastName.lastName,
    thumbnailUrl: null,
    language: appConfig.defaultLanguage,
    name: faker.person.fullName(firstAndLastName),
    email,
    slug,
    newsletter: faker.datatype.boolean(),
    createdAt: pastIsoDate(),
  };
};

/**
 * Generates a fixed "Admin" user with provided ID, email, and password.
 * Used for default admin seeding.
 *
 * @param id - The fixed ID to assign.
 * @param email - Admin email address.
 * @param hashedPassword - Hashed password for the admin.
 * @returns A valid InsertUserModel for the admin user.
 */
export const mockAdmin = (id: string, email: string): InsertUserModel => {
  return {
    id,
    firstName: 'Admin',
    lastName: 'User',
    name: 'Admin User',
    slug: 'admin-user',
    role: 'admin',
    email,
    language: appConfig.defaultLanguage,
    thumbnailUrl: null,
    newsletter: false,
    createdAt: pastIsoDate(),
  }
}

/**
 * Generates a password record for a given user.
 *
 * @param user - The user for whom the email record is created.
 * @returns A valid InsertPasswordModel.
 */
export const mockPassword = (user: UserModel, hashedPassword: string): InsertPasswordModel => {
  return {
    hashedPassword,
    userId: user.id,
    createdAt: pastIsoDate(),
  }
}

/**
 * Generates an unsubscribeToken record for a given user.
 *
 * @param user - The user for whom the email record is created.
 * @returns A valid InsertUnsubscribeTokenModel.
 */
export const mockUnsubscribeToken = (user: UserModel): InsertUnsubscribeTokenModel => {
  return {
    token: generateUnsubscribeToken(user.email),
    userId: user.id,
    createdAt: pastIsoDate(),
  }
}

/**
 * Generates a verified email record for a given user.
 *
 * @param user - The user for whom the email record is created.
 * @returns A valid InsertEmailModel.
 */
export const mockEmail = (user: UserModel): InsertEmailModel => {
  return {
    email: user.email,
    userId: user.id,
    verified: true,
    verifiedAt: pastIsoDate(),
  }
}

/**
 * Generates a mock membership linking a user to an organization.
 * Ensures consistent ordering via the `getMembershipOrderOffset` function.
 *
 * @param organization - The organization the user will belong to.
 * @param user - The user to assign membership to.
 * @returns A valid InsertMembershipModel.
 */
export const mockOrganizationMembership = (organization: OrganizationModel, user: UserModel): InsertMembershipModel => {
  return {
    id: nanoid(),
    userId: user.id,
    organizationId: organization.id,
    contextType: 'organization',
    role: faker.helpers.arrayElement(appConfig.roles.entityRoles),
    order: getMembershipOrderOffset(organization.id) * 10,
    createdAt: pastIsoDate(),
  }
}

/**
 * Utility function to generate an array of mock records using a factory function.
 *
 * @param factory - A function that generates a single mock record.
 * @param count - Number of records to generate.
 * @returns An array of generated mock records.
 */
export function mockMany<T>(factory: () => T, count: number): T[] {
  const items: T[] = [];
  for (let i = 0; i < count; i++) {
    items.push(factory());
  }
  return items;
}