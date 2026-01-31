import { faker } from '@faker-js/faker';
import { mockNanoid, withFakerSeed } from './utils';

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
    const refDate = new Date('2025-01-01T00:00:00.000Z');
    const createdAt = faker.date.past({ refDate });

    return {
      id: mockNanoid(),
      userId: mockNanoid(),
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
 * Generates a mock create password response.
 * Used for createPassword endpoint example.
 */
export const mockCreatePasswordResponse = (key = 'create-password:default') =>
  withFakerSeed(key, () => ({
    mfa: false,
  }));

/**
 * Generates a mock TOTP key response.
 * Used for generateTotpKey endpoint example.
 */
export const mockTotpKeyResponse = (key = 'totp-key:default') =>
  withFakerSeed(key, () => ({
    totpUri: `otpauth://totp/Cella:user@example.com?secret=${faker.string.alphanumeric(32).toUpperCase()}&issuer=Cella`,
    manualKey: faker.string.alphanumeric(32).toUpperCase(),
  }));

/**
 * Generates a mock token data response.
 * Used for getTokenData endpoint example.
 */
export const mockTokenDataResponse = (key = 'token-data:default') =>
  withFakerSeed(key, () => ({
    email: faker.internet.email({ provider: 'demo.local' }).toLowerCase(),
    userId: mockNanoid(),
    inactiveMembershipId: undefined,
  }));
