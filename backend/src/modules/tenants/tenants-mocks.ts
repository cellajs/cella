import { faker } from '@faker-js/faker';
import { config } from 'shared/config/config.default';
import { mockPaginated, mockTenantId, mockTimestamps, mockUuid, withFakerSeed } from '#/mocks';
import { mockActorRef } from '#/schemas/entity-base-mocks';

export const mockTenantResponse = (key = 'tenant:default') =>
  withFakerSeed(key, () => {
    const name = faker.company.name();
    const timestamps = mockTimestamps();
    return {
      id: mockTenantId(),
      name,
      kind: 'live' as const,
      status: 'active' as const,
      statusChangedAt: timestamps.createdAt,
      expiresAt: null,
      // The base config: the example reads alike in every mode `pnpm sdk` runs in.
      restrictions: config.defaultRestrictions,
      authStrategies: [],
      createdBy: mockActorRef(`${key}:created-by`),
      updatedBy: null,
      ...timestamps,
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
