import { faker } from '@faker-js/faker';
import type { RequestModel } from '#/db/schema/requests';
import { mockNanoid, mockPaginated, withFakerSeed } from './utils';

/** Response type for request schema (excludes tokenId, adds wasInvited) */
export interface RequestResponse extends Omit<RequestModel, 'tokenId'> {
  wasInvited: boolean;
}

/**
 * Generates a mock request with all fields populated.
 * Uses deterministic seeding - same key produces same data.
 * Used for DB seeding, tests, and API response examples.
 */
export const mockRequest = (key = 'request:default'): RequestModel =>
  withFakerSeed(key, () => ({
    id: mockNanoid(),
    email: faker.internet.email().toLowerCase(),
    type: 'contact' as const,
    message: faker.lorem.sentence(),
    createdAt: faker.date.past({ refDate: new Date('2025-01-01T00:00:00.000Z') }).toISOString(),
    tokenId: null,
  }));

/**
 * Generates a mock request response (for API examples).
 * Excludes tokenId and adds wasInvited field.
 */
export const mockRequestResponse = (key = 'request:default'): RequestResponse =>
  withFakerSeed(key, () => {
    const { tokenId: _, ...request } = mockRequest(key);
    return {
      ...request,
      wasInvited: false,
    };
  });

/**
 * Generates a paginated mock request list response for getRequests endpoint.
 */
export const mockPaginatedRequestsResponse = (count = 2) => mockPaginated(mockRequestResponse, count);
