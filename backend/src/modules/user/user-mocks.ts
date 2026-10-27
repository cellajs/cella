import { faker } from '@faker-js/faker';
import { appConfig } from 'shared';
import slugify from 'slugify';
import { mockPaginated, mockPastIsoDate, mockUniqueEnforcer, mockUuid, withFakerSeed } from '#/mocks';
import type { InsertEmailModel } from '#/modules/user/emails-db';
import type { UserWithActivity } from '#/modules/user/helpers/select';
import type { InsertUserModel, UserModel } from '#/modules/user/user-db';
import { mockUserBase } from '#/schemas/entity-base-mocks';

type MockUserOptions = { email?: string; enforceUnique?: boolean };

const userSlug = mockUniqueEnforcer();
const userEmail = mockUniqueEnforcer();

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
    contrast: 'system' as const,
    mfaRequired: false,
    userFlags: { ...appConfig.defaultUserFlags },
    createdAt,
    updatedAt: createdAt,
    updatedBy: null,
  };
};

/** Generates a full insertable user while enforcing unique email and slug values. */
export const mockUser = (overrides: Pick<MockUserOptions, 'email'> = {}): InsertUserModel => generateUser({ ...overrides, enforceUnique: true });

export const mockUserResponse = (key = 'user:default'): UserWithActivity =>
  withFakerSeed(key, () => {
    const user = generateUser();
    return { ...user, lastSignInAt: user.createdAt, lastSeenAt: user.createdAt };
  });

/** A user as another user sees them: the `UserBase` fields and the last-seen time. */
export const mockMemberUserResponse = (key = 'member-user:default') => {
  const user = mockUserBase(`${key}:user`);
  return { ...user, lastSeenAt: user.updatedAt };
};

export const mockPaginatedUsersResponse = (count = 2) => mockPaginated(mockMemberUserResponse, count);

/** Fixed "Admin" user for default admin seeding. */
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

export const mockEmail = (user: UserModel): InsertEmailModel => {
  return { email: user.email, userId: user.id, verifiedAt: mockPastIsoDate() };
};
