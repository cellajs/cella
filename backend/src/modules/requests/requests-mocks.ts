import { faker } from '@faker-js/faker';
import { mockPaginated, mockPastIsoDate, mockUuid, withFakerSeed } from '#/mocks';
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
    createdAt: mockPastIsoDate(),
    tokenId: null,
  }));

/** Request wire response excludes tokenId and includes invitation state. */
export const mockRequestResponse = (key = 'request:default'): RequestResponse => {
  const { tokenId: _, ...request } = mockRequest(key);
  return {
    ...request,
    wasInvited: false,
  };
};

export const mockPaginatedRequestsResponse = (count = 2) => mockPaginated(mockRequestResponse, count);

export const mockRequestBaseResponse = mockRequestResponse;
