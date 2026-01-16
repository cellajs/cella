import { faker } from '@faker-js/faker';
import type { MeAuthDataResponse, MeResponse, UploadTokenResponse } from '#/modules/me/types';
import { registerExample } from './example-registry';
import { mockUserResponse } from './mock-user';
import { mockNanoid, withFakerSeed } from './utils';

/**
 * Generates a mock Me response (current user with system role).
 * Used for getMe endpoint example.
 */
export const mockMeResponse = (key = 'me:default'): MeResponse =>
  withFakerSeed(key, () => ({
    user: mockUserResponse('me:user'),
    systemRole: 'user' as const,
  }));

/**
 * Generates a mock MeAuthData response.
 * Used for getMyAuth endpoint example.
 */
export const mockMeAuthDataResponse = (key = 'me-auth:default'): MeAuthDataResponse =>
  withFakerSeed(key, () => {
    const refDate = new Date('2025-01-01T00:00:00.000Z');
    const sessionCreatedAt = faker.date.past({ refDate });
    const sessionExpiresAt = new Date(sessionCreatedAt.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days later

    return {
      enabledOAuth: ['github'] as const,
      hasTotp: false,
      hasPassword: true,
      sessions: [
        {
          id: mockNanoid(),
          userId: mockNanoid(),
          type: 'regular' as const,
          createdAt: sessionCreatedAt.toISOString(),
          expiresAt: sessionExpiresAt.toISOString(),
          deviceName: faker.helpers.arrayElement(['Chrome on Mac', 'Firefox on Windows', 'Safari on iPhone']),
          deviceType: faker.helpers.arrayElement(['desktop', 'mobile'] as const),
          deviceOs: faker.helpers.arrayElement(['macOS', 'Windows', 'iOS', 'Android']),
          browser: faker.helpers.arrayElement(['Chrome', 'Firefox', 'Safari', 'Edge']),
          authStrategy: 'password' as const,
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
    const refDate = new Date('2025-01-01T00:00:00.000Z');
    const expiresAt = faker.date.soon({ days: 1, refDate });

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

// Self-register for OpenAPI examples
registerExample('Me', mockMeResponse);
registerExample('MeAuthData', mockMeAuthDataResponse);
registerExample('UploadToken', mockUploadTokenResponse);
