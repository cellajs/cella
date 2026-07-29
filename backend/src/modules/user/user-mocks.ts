import { faker } from '@faker-js/faker';
import { UniqueEnforcer } from 'enforce-unique';
import { appConfig, type SystemRole } from 'shared';
import slugify from 'slugify';
import { mockPaginated, mockPastIsoDate, mockUuid, withFakerSeed } from '#/mocks';
import { mockMembershipBase } from '#/modules/memberships/memberships-mocks';
import type { InsertEmailModel } from '#/modules/user/emails-db';
import type { UserWithCounters } from '#/modules/user/helpers/select';
import type { InsertUnsubscribeTokenModel } from '#/modules/user/unsubscribe-tokens-db';
import type { InsertUserModel, UserModel } from '#/modules/user/user-db';

type MockUserOptions = { email?: string; enforceUnique?: boolean };

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

const generateUser = ({ email: emailOverride, enforceUnique = false }: MockUserOptions = {}): UserModel => {
  const firstAndLastName = { firstName: faker.person.firstName(), lastName: faker.person.lastName() };
  const generateEmail = () => faker.internet.email(firstAndLastName).toLowerCase();
  const generateSlug = () => slugify(faker.internet.username(firstAndLastName), { lower: true, strict: true });
  const email = emailOverride ?? (enforceUnique ? userEmail.enforce(generateEmail) : generateEmail());
  const slug = enforceUnique ? userSlug.enforce(generateSlug, { maxTime: 500, maxRetries: 500 }) : generateSlug();
  const createdAt = mockPastIsoDate();

  return {
    id: mockUuid(),
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
    userFlags: { ...appConfig.defaultUserFlags },
    createdAt,
    updatedAt: createdAt,
    updatedBy: null,
  };
};

/** Generates a full insertable user while enforcing unique email and slug values. */
export const mockUser = (overrides: Pick<MockUserOptions, 'email'> = {}): InsertUserModel =>
  generateUser({ ...overrides, enforceUnique: true });

/**
 * Generates a mock user API response with deterministic seeding.
 * Same key produces same data across runs.
 */
export const mockUserResponse = (key = 'user:default'): UserWithCounters =>
  withFakerSeed(key, () => {
    const user = generateUser();
    return {
      ...user,
      lastStartedAt: user.createdAt,
      lastSignInAt: user.createdAt,
      lastSeenAt: user.createdAt,
    };
  });

/** User list item type for getUsers endpoint (includes memberships array and optional role) */
export interface UserListItem extends UserWithCounters {
  memberships: ReturnType<typeof mockMembershipBase>[];
  role?: SystemRole;
}

/**
 * Generates a mock user list item for getUsers response.
 * Includes user data with memberships array and optional system role.
 */
export const mockUserListItem = (key = 'userListItem:default'): UserListItem => ({
  ...mockUserResponse(`${key}:user`),
  memberships: [mockMembershipBase(`${key}:membership`)],
  role: undefined,
});

export const mockPaginatedUsersResponse = (count = 2) => mockPaginated(mockUserListItem, count);

/**
 * Generates a fixed "Admin" user with provided email and optional ID.
 * Used for default admin seeding.
 */
export const mockAdmin = (id: string | undefined, email: string): InsertUserModel => {
  return {
    ...(id ? { id } : {}),
    firstName: 'Admin',
    lastName: 'User',
    name: 'Admin User',
    slug: 'admin-user',
    email,
    language: appConfig.defaultLanguage,
    thumbnailUrl: null,
    newsletter: false,
    createdAt: mockPastIsoDate(),
  };
};

/**
 * Generates an unsubscribeToken row for a given user.
 */
export const mockUnsubscribeToken = async (user: UserModel): Promise<InsertUnsubscribeTokenModel> => {
  const { generateUnsubscribeToken } = await import('#/utils/unsubscribe-token');
  return {
    secret: generateUnsubscribeToken(user.email),
    userId: user.id,
    createdAt: mockPastIsoDate(),
  };
};

/**
 * Generates a verified email row for a given user.
 */
export const mockEmail = (user: UserModel): InsertEmailModel => {
  return {
    email: user.email,
    userId: user.id,
    verified: true,
    verifiedAt: mockPastIsoDate(),
  };
};
