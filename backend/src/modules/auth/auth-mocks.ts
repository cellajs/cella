import { faker } from '@faker-js/faker';
import { mockPastIsoDate, mockRefDate, mockTimestamps, mockUuid, withFakerSeed } from '#/mocks';
import { mockChannelBase } from '#/schemas/entity-base-mocks';
import { TimeSpan } from '#/utils/time-span';

export const mockPasskeyChallengeResponse = (key = 'passkey-challenge:default') =>
  withFakerSeed(key, () => ({
    challenge: faker.string.alphanumeric(43),
    credentials: [{ id: faker.string.alphanumeric(32), transports: ['hybrid' as const, 'internal' as const] }],
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
      lastUsedAt: null,
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
    invitationId: undefined,
    inviterName: faker.person.fullName(),
  }));

export const mockSsoEntryResponse = (key = 'sso-entry:default') =>
  withFakerSeed(key, () => {
    const name = faker.company.name();
    return {
      id: mockUuid(),
      status: 'active' as const,
      federation: { key: 'surfconext', name: 'SURFconext' },
      institution: { name: 'Utrecht University', logoUrl: null },
      organization: { id: mockUuid(), name, slug: faker.helpers.slugify(name).toLowerCase(), thumbnailUrl: null },
    };
  });

export const mockMeAuthResponse = (key = 'me-auth:default') =>
  withFakerSeed(key, () => {
    const sessionCreatedAt = faker.date.past({ refDate: mockRefDate });
    // One session lifetime later.
    const sessionExpiresAt = new Date(sessionCreatedAt.getTime() + new TimeSpan(1, 'w').milliseconds());

    return {
      oauthIdentities: [
        {
          provider: 'github' as const,
          email: faker.internet.email(),
          createdAt: sessionCreatedAt.toISOString(),
          lastUsedAt: sessionCreatedAt.toISOString(),
        },
      ],
      institutions: [],
      totp: null,
      sessions: [
        {
          id: mockUuid(),
          userId: mockUuid(),
          kind: 'regular' as const,
          createdAt: sessionCreatedAt.toISOString(),
          expiresAt: sessionExpiresAt.toISOString(),
          deviceName: faker.helpers.arrayElement(['Chrome on Mac', 'Firefox on Windows', 'Safari on iPhone']),
          deviceType: faker.helpers.arrayElement(['desktop', 'mobile'] as const),
          deviceOs: faker.helpers.arrayElement(['macOS', 'Windows', 'iOS', 'Android']),
          browser: faker.helpers.arrayElement(['Chrome', 'Firefox', 'Safari', 'Edge']),
          authStrategy: 'passkey' as const,
          connectionId: null,
          ipHash: null,
          ipSubnetHash: null,
          ipRegionCode: null,
          ipAsn: null,
          deviceIdHash: faker.string.hexadecimal({ length: 32, prefix: '', casing: 'lower' }),
          revokedAt: null,
          revocationReason: null,
          steppedUpAt: null,
          steppedUpVia: null,
          current: true,
          newDevice: false,
        },
      ],
      passkeys: [],
    };
  });

/** A course of an LTI connection whose last member import read everyone. */
export const mockLtiContextResponse = (key = 'ltiContext:default') =>
  withFakerSeed(key, () => {
    const { createdAt, updatedAt } = mockTimestamps();
    return {
      id: mockUuid(),
      connectionId: mockUuid(),
      contextId: 'biology-101',
      label: 'BIO-101',
      title: 'Introduction to biology',
      channel: mockChannelBase(`${key}:channel`),
      membershipsUrl: 'https://lms.example.com/api/lti/courses/biology-101/memberships',
      importRanAt: updatedAt,
      importReadCount: 42,
      importIssue: null,
      createdAt,
    };
  });
