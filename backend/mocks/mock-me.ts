import { faker } from '@faker-js/faker';
import type { MeAuthDataResponse, MeResponse, UploadTokenResponse } from '#/modules/me/types';
import { mockContextEntityBase } from './mock-entity-base';
import { mockInactiveMembershipResponse } from './mock-membership';
import { mockUserResponse } from './mock-user';
import { MOCK_REF_DATE, mockNanoid, mockPaginated, mockUuid, withFakerSeed } from './utils';

/**
 * Generates a mock Me response (current user with system role).
 * Used for getMe endpoint example.
 */
export const mockMeResponse = (key = 'me:default'): MeResponse =>
  withFakerSeed(key, () => ({
    user: mockUserResponse('me:user'),
    isSystemAdmin: false,
  }));

/**
 * Generates a mock MeAuthData response.
 * Used for getMyAuth endpoint example.
 */
export const mockMeAuthDataResponse = (key = 'me-auth:default'): MeAuthDataResponse =>
  withFakerSeed(key, () => {
    const sessionCreatedAt = faker.date.past({ refDate: MOCK_REF_DATE });
    const sessionExpiresAt = new Date(sessionCreatedAt.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days later

    return {
      enabledOAuth: ['github'] as const,
      hasTotp: false,
      sessions: [
        {
          id: mockUuid(),
          userId: mockUuid(),
          type: 'regular' as const,
          createdAt: sessionCreatedAt.toISOString(),
          expiresAt: sessionExpiresAt.toISOString(),
          deviceName: faker.helpers.arrayElement(['Chrome on Mac', 'Firefox on Windows', 'Safari on iPhone']),
          deviceType: faker.helpers.arrayElement(['desktop', 'mobile'] as const),
          deviceOs: faker.helpers.arrayElement(['macOS', 'Windows', 'iOS', 'Android']),
          browser: faker.helpers.arrayElement(['Chrome', 'Firefox', 'Safari', 'Edge']),
          authStrategy: 'passkey' as const,
          ipHash: null,
          ipSubnetHash: null,
          ipCountry: null,
          ipAsn: null,
          isCurrent: true,
        },
      ],
      passkeys: [],
    };
  });

/**
 * Generates a mock UploadToken response.
 * Used for getUploadToken endpoint example.
 */
export const mockUploadTokenResponse = (key = 'upload-token:default'): UploadTokenResponse =>
  withFakerSeed(key, () => {
    const expiresAt = faker.date.soon({ days: 1, refDate: MOCK_REF_DATE });

    return {
      public: false,
      sub: mockNanoid(),
      s3: true,
      signature: faker.string.alphanumeric(64),
      params: {
        auth: {
          key: `uploads/${mockNanoid()}`,
          expires: expiresAt.toISOString(),
        },
      },
    };
  });

/**
 * Generates a mock pending invitation response.
 * Used for getMyInvitations endpoint example.
 */
export const mockPendingInvitationResponse = (key = 'pending-invitation:default') =>
  withFakerSeed(key, () => ({
    entity: mockContextEntityBase(`${key}:entity`),
    inactiveMembership: mockInactiveMembershipResponse(`${key}:inactive-membership`),
  }));

/**
 * Generates a paginated mock pending invitation list response for getMyInvitations endpoint.
 */
export const mockPaginatedInvitationsResponse = (count = 2) => mockPaginated(mockPendingInvitationResponse, count);

/**
 * Generates a mock stream response.
 * Used for getAppStream / getPublicStream endpoint examples (JSON mode).
 */
export const mockStreamResponse = (key = 'stream:default') =>
  withFakerSeed(key, () => {
    const cursor = mockNanoid();
    return {
      changes: {
        'org-example-id': {
          deletedByType: {},
        },
      },
      cursor,
    };
  });
