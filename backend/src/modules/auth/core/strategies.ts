import type { FederationKey } from 'shared';
import { oauthProviders } from 'shared/config-builder/types';
import { federationKeys } from '#/modules/auth/core/federations/federation-keys';

/**
 * The built-in sign-in methods; `anonymous` is the session minted for an account without an identity (a demo's), which
 * no other method signs in. A federation key from `appConfig.federations` is a method too ({@link AuthStrategy}).
 */
const baseAuthStrategies = [...oauthProviders, 'passkey', 'totp', 'email', 'magic', 'anonymous'] as const;

/** A sign-in method as a session records it: a built-in one, or a federation key. */
export type AuthStrategy = (typeof baseAuthStrategies)[number] | FederationKey;

/**
 * Every {@link AuthStrategy}: the enum of the columns and request fields that hold one. Built when the backend loads, so
 * a federation the test setup adds to the config is in.
 */
export const authStrategiesEnum = [...baseAuthStrategies, ...federationKeys] as const;

/**
 * How a session last proved its user's presence again: a second factor (a step-up, the MFA completion that minted the
 * session, or setting the factor up), an emailed code, or `sso` for an SSO sign-in whose institution asserted MFA.
 */
export const stepUpProofs = ['passkey', 'totp', 'email', 'sso'] as const;
export type StepUpProof = (typeof stepUpProofs)[number];

/** The proofs that count as a second factor: a passkey or authenticator the user holds, or an institution's asserted MFA. */
export const isSecondFactor = (proof: StepUpProof | null | undefined): proof is 'passkey' | 'totp' | 'sso' =>
  proof === 'passkey' || proof === 'totp' || proof === 'sso';

/** The `amr` values of one method or proof; the registry has none for WebAuthn, so a passkey is the nearest pair. */
const amrValuesOf = (method: AuthStrategy | StepUpProof): string[] => {
  if (method === 'passkey') return ['hwk', 'user'];
  if (method === 'totp' || method === 'email' || method === 'magic') return ['otp'];
  if (method === 'anonymous' || method === 'sso') return [];
  return [`ext:${method}`];
};

/**
 * The RFC 8176 `amr` values of a sign-in, for the tokens the app issues: the method that started it, the factor that proved
 * it, and `mfa` once a second factor stands (a passkey proves both factors itself). Registered values where one fits
 * (`hwk`, `user`, `otp`, `mfa`); a provider or federation sign-in has none and takes `ext:<key>`.
 */
export const amrOf = (strategy: AuthStrategy, factor: StepUpProof | null): string[] => {
  const values = new Set([...amrValuesOf(strategy), ...(factor ? amrValuesOf(factor) : [])]);
  if (strategy === 'passkey' || isSecondFactor(factor)) values.add('mfa');
  return [...values];
};
