import { faker } from '@faker-js/faker';
import { mockPaginated, mockPastIsoDate, mockUuid, withFakerSeed } from '#/mocks';
import type { RequestModel } from '#/modules/requests/requests-db';

export interface RequestResponse extends Omit<RequestModel, 'tokenId'> {
  wasInvited: boolean;
}

export const mockRequest = (key = 'request:default'): RequestModel =>
  withFakerSeed(key, () => ({
    id: mockUuid(),
    email: faker.internet.email().toLowerCase(),
    type: 'contact' as const,
    message: faker.lorem.sentence(),
    createdAt: mockPastIsoDate(),
    tokenId: null,
  }));

export const mockRequestResponse = (key = 'request:default'): RequestResponse => {
  const { tokenId: _, ...request } = mockRequest(key);
  return {
    ...request,
    wasInvited: false,
  };
};

export const mockPaginatedRequestsResponse = (count = 2) => mockPaginated(mockRequestResponse, count);

export const mockRequestBaseResponse = mockRequestResponse;
