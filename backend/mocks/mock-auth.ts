import { faker } from '@faker-js/faker';
import { nanoid } from 'shared/nanoid';
import { MOCK_REF_DATE, mockUuid, withFakerSeed } from './utils';

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
    const refDate = MOCK_REF_DATE;
    const createdAt = faker.date.past({ refDate });

    return {
      id: mockUuid(),
      userId: mockUuid(),
      nameOnDevice: faker.helpers.arrayElement(['Chrome on Mac', 'Safari on iPhone', 'Firefox on Windows']),
      userAgent: faker.internet.userAgent(),
      createdAt: createdAt.toISOString(),
    };
  });

/**
 * Generates a mock sign in response.
 * Used for signIn endpoint example.
 */
export const mockSignInResponse = (key = 'sign-in:default') =>
  withFakerSeed(key, () => ({
    emailVerified: true,
    mfa: false,
  }));

/**
 * Generates a mock sign up with token response.
 * Used for signUpWithToken endpoint example.
 */
export const mockSignUpWithTokenResponse = (key = 'sign-up-token:default') =>
  withFakerSeed(key, () => ({
    membershipInvite: true,
  }));

/**
 * Generates a mock TOTP key response.
 * Used for generateTotpKey endpoint example.
 */
export const mockTotpKeyResponse = (key = 'totp-key:default') =>
  withFakerSeed(key, () => ({
    totpUri: `otpauth://totp/App:user@example.com?secret=${faker.string.alphanumeric(32).toUpperCase()}&issuer=App`,
    manualKey: faker.string.alphanumeric(32).toUpperCase(),
  }));

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
 * Generates a mock passkey DB record for insertion.
 * Used in passkey integration tests.
 */
export const mockPasskeyRecord = (userId: string, nameOnDevice = 'Test Device', key = 'passkey-record:default') =>
  withFakerSeed(key, () => ({
    userId,
    credentialId: nanoid(32),
    publicKey: nanoid(40),
    nameOnDevice,
    deviceType: 'desktop' as const,
    createdAt: faker.date.past({ refDate: MOCK_REF_DATE }).toISOString(),
  }));
