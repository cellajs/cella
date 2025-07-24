import { InsertEmailModel } from "#/db/schema/emails";
import { InsertUserModel, UserModel } from "#/db/schema/users";
import { faker } from "@faker-js/faker";
import { pastIsoDate } from "./past-iso-date";
import { generateUnsubscribeToken } from "#/modules/users/helpers/unsubscribe-token";
import { config } from "config";
import { nanoid } from "nanoid";
import slugify from "slugify";
import { InsertOrganizationModel, OrganizationModel } from "#/db/schema/organizations";
import { UniqueEnforcer } from "enforce-unique";
import { InsertMembershipModel } from "#/db/schema/memberships";

const organizationName = new UniqueEnforcer();
const userSlug = new UniqueEnforcer();
const userEmail = new UniqueEnforcer();

const membershipOrderMap: Map<string, number> = new Map();

export const getMembershipOrderOffset = (contextId: string): number => {
  if (!membershipOrderMap.has(contextId)) {
    membershipOrderMap.set(contextId, membershipOrderMap.size + 1);
  }
  return membershipOrderMap.get(contextId)!;
}

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

export const mockUser = (hashedPassword: string): InsertUserModel => {
  const firstAndLastName = { firstName: faker.person.firstName(), lastName: faker.person.lastName() };
  const email = userEmail.enforce(() => faker.internet.email(firstAndLastName).toLocaleLowerCase());
  const slug = userSlug.enforce(() => slugify(faker.internet.username(firstAndLastName), { lower: true, strict: true }), { maxTime: 500, maxRetries: 500 })

  return {
    id: nanoid(),
    firstName: firstAndLastName.firstName,
    lastName: firstAndLastName.lastName,
    thumbnailUrl: null,
    language: config.defaultLanguage,
    name: faker.person.fullName(firstAndLastName),
    email,
    unsubscribeToken: generateUnsubscribeToken(email),
    hashedPassword: hashedPassword,
    slug,
    newsletter: faker.datatype.boolean(),
    createdAt: pastIsoDate(),
  };
};


export const mockAdmin = (id: string, email: string, hashedPassword: string): InsertUserModel => {
  return {
    id,
    firstName: 'Admin',
    lastName: 'User',
    name: 'Admin User',
    slug: 'admin-user',
    role: 'admin',
    email,
    unsubscribeToken: generateUnsubscribeToken(email),
    hashedPassword,
    language: config.defaultLanguage,
    thumbnailUrl: null,
    newsletter: false,
    createdAt: pastIsoDate(),
  }
}

export const mockEmail = (user: UserModel): InsertEmailModel => {
  return {
    email: user.email,
    userId: user.id,
    verified: true,
    verifiedAt: pastIsoDate(),
  }
}

export const mockOrganizationMembership = (organization: OrganizationModel, user: UserModel): InsertMembershipModel => {
  return {
    id: nanoid(),
    userId: user.id,
    organizationId: organization.id,
    contextType: 'organization',
    role: faker.helpers.arrayElement(config.rolesByType.entityRoles),
    order: getMembershipOrderOffset(organization.id) * 10,
    createdAt: pastIsoDate(),
    activatedAt: pastIsoDate(),
  }
}

export function mockMany<T>(factory: () => T, count: number): T[] {
  const items: T[] = [];
  for (let i = 0; i < count; i++) {
    items.push(factory());
  }
  return items;
}