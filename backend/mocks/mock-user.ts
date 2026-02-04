import { faker } from '@faker-js/faker';
import { UniqueEnforcer } from 'enforce-unique';
import { appConfig, type SystemRole, type UserFlags } from 'shared';
import slugify from 'slugify';
import type { InsertEmailModel } from '#/db/schema/emails';
import type { InsertPasswordModel } from '#/db/schema/passwords';
import type { InsertUnsubscribeTokenModel } from '#/db/schema/unsubscribe-tokens';
import type { InsertUserModel, UserModel } from '#/db/schema/users';
import { nanoid } from '#/utils/nanoid';
import { generateUnsubscribeToken } from '#/utils/unsubscribe-token';
import { mockMembershipBase } from './mock-membership';
import { mockNanoid, mockPaginated, pastIsoDate, withFakerSeed } from './utils';

/** Optional overrides for mock user generation */
type MockUserOptionalOverrides = Partial<{
  email: string;
}>;

// Enforces unique user slugs and emails
const userSlug = new UniqueEnforcer();
const userEmail = new UniqueEnforcer();

/**
 * Reset unique enforcers - call this when clearing the database in tests.
 */
export const resetUserMockEnforcers = () => {
  userSlug.reset();
  userEmail.reset();
};

/**
 * Generates a mock user with all fields populated.
 * Used for DB seeding and tests.
 * Enforces unique email and slug.
 */
export const mockUser = (overrides: MockUserOptionalOverrides = {}): InsertUserModel => {
  const firstAndLastName = { firstName: faker.person.firstName(), lastName: faker.person.lastName() };
  const email = overrides.email ?? userEmail.enforce(() => faker.internet.email(firstAndLastName).toLowerCase());
  const slug = userSlug.enforce(
    () => slugify(faker.internet.username(firstAndLastName), { lower: true, strict: true }),
    { maxTime: 500, maxRetries: 500 },
  );
  const createdAt = pastIsoDate();

  return {
    id: nanoid(),
    entityType: 'user' as const,
    name: faker.person.fullName(firstAndLastName),
    firstName: firstAndLastName.firstName,
    lastName: firstAndLastName.lastName,
    email,
    slug,
    description: null,
    thumbnailUrl: null,
    bannerUrl: null,
    language: appConfig.defaultLanguage,
    newsletter: faker.datatype.boolean(),
    mfaRequired: false,
    userFlags: {} as UserFlags,
    createdAt,
    modifiedAt: createdAt,
    modifiedBy: null,
    lastStartedAt: createdAt,
    lastSignInAt: createdAt,
  };
};

/**
 * Generates a mock user API response with deterministic seeding.
 * Same key produces same data across runs.
 */
export const mockUserResponse = (key = 'user:default'): UserModel =>
  withFakerSeed(key, () => {
    const refDate = new Date('2025-01-01T00:00:00.000Z');
    const createdAt = faker.date.past({ refDate }).toISOString();
    const firstAndLastName = { firstName: faker.person.firstName(), lastName: faker.person.lastName() };
    const email = faker.internet.email(firstAndLastName).toLowerCase();
    const slug = slugify(faker.internet.username(firstAndLastName), { lower: true, strict: true });

    return {
      id: mockNanoid(),
      entityType: 'user' as const,
      name: faker.person.fullName(firstAndLastName),
      firstName: firstAndLastName.firstName,
      lastName: firstAndLastName.lastName,
      email,
      slug,
      description: null,
      thumbnailUrl: null,
      bannerUrl: null,
      language: appConfig.defaultLanguage,
      newsletter: faker.datatype.boolean(),
      mfaRequired: false,
      userFlags: {} as UserFlags,
      createdAt,
      modifiedAt: createdAt,
      modifiedBy: null,
      lastStartedAt: createdAt,
      lastSignInAt: createdAt,
      lastSeenAt: createdAt,
    };
  });

/** User list item type for getUsers endpoint (includes memberships array and optional role) */
export interface UserListItem extends UserModel {
  memberships: ReturnType<typeof mockMembershipBase>[];
  role?: SystemRole;
}

/**
 * Generates a mock user list item for getUsers response.
 * Includes user data with memberships array and optional system role.
 */
export const mockUserListItem = (key = 'userListItem:default'): UserListItem =>
  withFakerSeed(key, () => ({
    ...mockUserResponse(`${key}:user`),
    memberships: [mockMembershipBase(`${key}:membership`)],
    role: undefined,
  }));

/**
 * Generates a paginated mock user list response for getUsers endpoint.
 */
export const mockPaginatedUsersResponse = (count = 2) => mockPaginated(mockUserListItem, count);

/**
 * Generates a fixed "Admin" user with provided ID and email.
 * Used for default admin seeding.
 */
export const mockAdmin = (id: string, email: string): InsertUserModel => {
  return {
    id,
    firstName: 'Admin',
    lastName: 'User',
    name: 'Admin User',
    slug: 'admin-user',
    email,
    language: appConfig.defaultLanguage,
    thumbnailUrl: null,
    newsletter: false,
    createdAt: pastIsoDate(),
  };
};

/**
 * Generates a password record for a given user.
 */
export const mockPassword = (user: UserModel, hashedPassword: string): InsertPasswordModel => {
  return {
    hashedPassword,
    userId: user.id,
    createdAt: pastIsoDate(),
  };
};

/**
 * Generates an unsubscribeToken record for a given user.
 */
export const mockUnsubscribeToken = (user: UserModel): InsertUnsubscribeTokenModel => {
  return {
    token: generateUnsubscribeToken(user.email),
    userId: user.id,
    createdAt: pastIsoDate(),
  };
};

/**
 * Generates a verified email record for a given user.
 */
export const mockEmail = (user: UserModel): InsertEmailModel => {
  return {
    email: user.email,
    userId: user.id,
    verified: true,
    verifiedAt: pastIsoDate(),
  };
};
