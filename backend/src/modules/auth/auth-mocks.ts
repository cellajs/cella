import { faker } from '@faker-js/faker';
import { mockNanoid, mockPastIsoDate, mockUuid, withFakerSeed } from '#/mocks';

export const mockPasskeyChallengeResponse = (key = 'passkey-challenge:default') =>
  withFakerSeed(key, () => ({
    challenge: faker.string.alphanumeric(43),
    credentialIds: [faker.string.alphanumeric(32)],
  }));

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

export const mockTotpKeyResponse = () => ({
  totpUri: 'otpauth://totp/App:user@example.com?secret=EXAMPLE-BASE32-KEY&issuer=App',
  manualKey: 'EXAMPLE-BASE32-KEY',
});

export const mockTokenDataResponse = (key = 'token-data:default') =>
  withFakerSeed(key, () => ({
    email: faker.internet.email({ provider: 'demo.local' }).toLowerCase(),
    userId: mockUuid(),
    inactiveMembershipId: undefined,
  }));

export const mockPasskeyRecord = (userId: string, nameOnDevice = 'Test Device', key = 'passkey-record:default') =>
  withFakerSeed(key, () => ({
    userId,
    credentialId: mockNanoid(32),
    publicKey: mockNanoid(40),
    counter: 0,
    nameOnDevice,
    deviceType: 'desktop' as const,
    createdAt: mockPastIsoDate(),
  }));
