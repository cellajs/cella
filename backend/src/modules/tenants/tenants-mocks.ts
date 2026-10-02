import { faker } from '@faker-js/faker';
import { mockPaginated, mockTenantId, mockTimestamps, mockUuid, withFakerSeed } from '#/mocks';
import { defaultRestrictions } from '#/modules/tenants/tenant-restrictions';

export const mockTenantResponse = (key = 'tenant:default') =>
  withFakerSeed(key, () => {
    const name = faker.company.name();
    return {
      id: mockTenantId(),
      name,
      status: 'active' as const,
      restrictions: defaultRestrictions(),
      authStrategies: [],
      createdBy: mockUuid(),
      subscriptionId: null,
      subscriptionStatus: 'none' as const,
      subscriptionPlan: null,
      ...mockTimestamps(),
      organization: {
        id: mockUuid(),
        name,
        slug: faker.helpers.slugify(name).toLowerCase(),
        thumbnailUrl: null,
        entityType: 'organization' as const,
      },
    };
  });

export const mockPaginatedTenantsResponse = (count = 2) => mockPaginated(mockTenantResponse, count);
