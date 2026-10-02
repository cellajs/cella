import { faker } from '@faker-js/faker';
import { mockPastIsoDate, mockUuid, withFakerSeed } from '#/mocks';

export const mockPasskeyChallengeResponse = (key = 'passkey-challenge:default') =>
  withFakerSeed(key, () => ({ challenge: faker.string.alphanumeric(43), credentialIds: [faker.string.alphanumeric(32)] }));

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

export const mockSsoEntryResponse = (key = 'sso-entry:default') =>
  withFakerSeed(key, () => {
    const name = faker.company.name();
    return {
      id: mockUuid(),
      status: 'active' as const,
      federation: { key: 'surfconext', label: 'SURFconext' },
      institution: { displayName: 'Utrecht University', logoUrl: null },
      organization: { id: mockUuid(), name, slug: faker.helpers.slugify(name).toLowerCase(), thumbnailUrl: null },
    };
  });
