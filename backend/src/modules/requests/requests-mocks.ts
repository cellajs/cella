import { faker } from '@faker-js/faker';
import { MOCK_REF_DATE, mockPaginated, mockTimestamps, mockUuid, withFakerSeed } from '#/mocks';
import type { RequestModel } from '#/modules/requests/requests-db';

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
    id: mockUuid(),
    email: faker.internet.email().toLowerCase(),
    type: 'contact' as const,
    message: faker.lorem.sentence(),
    createdAt: faker.date.past({ refDate: MOCK_REF_DATE }).toISOString(),
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

/**
 * Generates a mock Request base response for schema examples.
 * Requests are contact/waitlist submissions.
 */
export const mockRequestBaseResponse = (key = 'request:default') =>
  withFakerSeed(key, () => ({
    id: mockUuid(),
    email: faker.internet.email().toLowerCase(),
    type: faker.helpers.arrayElement(['contact', 'waitlist'] as const),
    message: faker.lorem.sentence(),
    createdAt: mockTimestamps().createdAt,
    wasInvited: faker.datatype.boolean(),
  }));
