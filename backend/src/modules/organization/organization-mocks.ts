import { faker } from '@faker-js/faker';
import { appConfig, type Language } from 'shared';
import {
  generateMockChannelCounts,
  mockBatchResponse,
  mockChannelColumns,
  mockPaginated,
  mockPastIsoDate,
  mockTenantId,
  mockUniqueEnforcer,
  mockUuid,
  withFakerSeed,
} from '#/mocks';
import { mockMembershipBase } from '#/modules/memberships/memberships-mocks';
import type { InsertOrganizationModel } from '#/modules/organization/organization-db';
import { mockActorRefs } from '#/schemas/entity-base-mocks';

const organizationName = mockUniqueEnforcer();

/** Base organization fields shared between insert and response mocks. */
const generateOrganizationBase = (id: string, tenantId: string, name: string, createdAt: string) => {
  const base = mockChannelColumns('organization', { id, tenantId, name, createdAt, updatedAt: createdAt, publishedAt: createdAt });
  const { slug } = base;

  return {
    ...base,
    shortName: name.split(' ')[0],
    regionCode: faker.location.countryCode(),
    timeZone: faker.location.timeZone(),
    defaultLanguageCode: appConfig.defaultLanguage,
    languageCodes: [appConfig.defaultLanguage] as Language[],
    notificationEmail: `notifications@${slug}.example`,
    color: faker.color.rgb().toLowerCase(),
    thumbnailUrl: null,
    bannerUrl: null,
    logoUrl: null,
    websiteUrl: `https://${slug}.example`,
    welcomeText: `Welcome to ${name}!`,
    chatSupport: faker.datatype.boolean(),
    organizationFlags: { ...appConfig.defaultOrganizationFlags },
    setupConfig: { ...appConfig.defaultSetupConfig },
    toolsConfig: {},
  };
};

export const mockOrganization = ({
  id = mockUuid(),
  name,
  createdAt,
}: {
  id?: string;
  name?: string;
  createdAt?: string;
} = {}): InsertOrganizationModel =>
  generateOrganizationBase(id, mockTenantId(), name ?? organizationName.enforce(() => faker.company.name()), createdAt ?? mockPastIsoDate());

/** Adds API-only fields (writer references, included.membership, included.counts) to the base mock. */
export const mockOrganizationResponse = (key = 'organization:default') =>
  withFakerSeed(key, () => {
    const createdAt = mockPastIsoDate();
    const organizationId = mockUuid();
    const tenantId = mockTenantId();

    const base = generateOrganizationBase(organizationId, tenantId, faker.company.name(), createdAt);

    const membership = mockMembershipBase(`${key}:membership`, {
      channelType: 'organization',
      channelId: organizationId,
      channelIds: { organizationId },
      tenantId,
    });

    return {
      ...base,
      ...mockActorRefs(base, key),
      included: { membership, counts: generateMockChannelCounts('organization', `${key}:counts`) },
    };
  });
export const mockOrganizationPublishResponse = () => ({ organization: mockOrganizationResponse(), invitationsSent: 12 });

/** The update body a caller with a key or token sends: only the fields it changes. */
export const mockUpdateOrganizationBody = () => {
  const { name, timeZone } = mockOrganizationResponse();
  return { name: `${name} Group`, timeZone };
};

export const mockPaginatedOrganizationsResponse = (count = 2) => mockPaginated(mockOrganizationResponse, count);

export const mockBatchOrganizationsResponse = (count = 2) => mockBatchResponse(mockOrganizationResponse, count);
