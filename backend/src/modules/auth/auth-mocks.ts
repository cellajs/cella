import { faker } from '@faker-js/faker';
import { mockNanoid, mockPastIsoDate, mockUuid, withFakerSeed } from '#/mocks';

/**
 * Generates a mock passkey challenge response.
 * Used for generatePasskeyChallenge endpoint example.
 */
export const mockPasskeyChallengeResponse = (key = 'passkey-challenge:default') =>
  withFakerSeed(key, () => ({
    challengeBase64: faker.string.alphanumeric(43),
    credentialIds: [faker.string.alphanumeric(32)],
  }));

/**
 * Generates a mock passkey response.
 * Used for createPasskey endpoint example.
 */
export const mockPasskeyResponse = (key = 'passkey:default') =>
  withFakerSeed(key, () => {
    const device = faker.helpers.arrayElement([
      { deviceName: 'MacBook Pro', deviceType: 'desktop', deviceOs: 'macOS', browser: 'Chrome' },
      { deviceName: 'iPhone', deviceType: 'mobile', deviceOs: 'iOS', browser: 'Safari' },
    ] as const);
    return {
      id: mockUuid(),
      userId: mockUuid(),
      ...device,
      nameOnDevice: `${device.browser} on ${device.deviceName}`,
      createdAt: mockPastIsoDate(),
    };
  });

/**
 * Generates a mock TOTP key response.
 * Used for generateTotpKey endpoint example.
 */
export const mockTotpKeyResponse = () => ({
  totpUri: 'otpauth://totp/App:user@example.com?secret=EXAMPLE-BASE32-KEY&issuer=App',
  manualKey: 'EXAMPLE-BASE32-KEY',
});

/**
 * Generates a mock token data response.
 * Used for getTokenData endpoint example.
 */
export const mockTokenDataResponse = (key = 'token-data:default') =>
  withFakerSeed(key, () => ({
    email: faker.internet.email({ provider: 'demo.local' }).toLowerCase(),
    userId: mockUuid(),
    inactiveMembershipId: undefined,
  }));

/**
 * Generates a mock passkey DB row for insertion.
 * Used in passkey integration tests.
 */
export const mockPasskeyRecord = (userId: string, nameOnDevice = 'Test Device', key = 'passkey-record:default') =>
  withFakerSeed(key, () => ({
    userId,
    credentialId: mockNanoid(32),
    publicKey: mockNanoid(40),
    nameOnDevice,
    deviceType: 'desktop' as const,
    createdAt: mockPastIsoDate(),
  }));
