import { describe, expect, it } from 'vitest';
import type {
  GithubUserEmailProps,
  GithubUserProps,
  GoogleUserProps,
  MicrosoftUserProps,
} from '#/modules/auth/oauth/helpers/providers';
import { transformGithubUserData, transformSocialUserData } from '#/modules/auth/oauth/helpers/transform-user-data';

const githubUser = {
  id: 123,
  login: 'octocat',
  name: 'Octo Cat',
  avatar_url: 'https://example.com/a.png',
} as GithubUserProps;

const ghEmail = (email: string, primary: boolean, verified: boolean): GithubUserEmailProps => ({
  email,
  primary,
  verified,
  visibility: null,
});

describe('transformGithubUserData', () => {
  it('selects the primary email and normalizes it', () => {
    const result = transformGithubUserData(githubUser, [
      ghEmail('Secondary@Example.com', false, true),
      ghEmail('Primary@Example.com', true, true),
    ]);

    expect(result.email).toBe('primary@example.com');
    expect(result.emailVerified).toBe(true);
  });

  it('surfaces emailVerified=false when the primary GitHub email is unverified', () => {
    // Regression guard: an unverified provider email must not be reported as verified,
    // so downstream account creation/linking never auto-trusts it.
    const result = transformGithubUserData(githubUser, [ghEmail('primary@example.com', true, false)]);

    expect(result.emailVerified).toBe(false);
  });

  it('throws when there is no primary email', () => {
    expect(() => transformGithubUserData(githubUser, [ghEmail('only@example.com', false, true)])).toThrow(
      'no_email_found',
    );
  });
});

describe('transformSocialUserData', () => {
  it('trusts Google email_verified flag', () => {
    const google = {
      sub: 'g1',
      name: 'G User',
      email: 'User@Gmail.com',
      email_verified: true,
      picture: 'p',
      given_name: 'G',
      family_name: 'User',
      locale: 'en',
    } as GoogleUserProps;
    const result = transformSocialUserData(google);

    expect(result.email).toBe('user@gmail.com');
    expect(result.emailVerified).toBe(true);
  });

  it('does not auto-verify when email_verified is false', () => {
    const google = {
      sub: 'g2',
      name: 'G User',
      email: 'user@gmail.com',
      email_verified: false,
      picture: 'p',
      given_name: 'G',
      family_name: 'User',
      locale: 'en',
    } as GoogleUserProps;

    expect(transformSocialUserData(google).emailVerified).toBe(false);
  });

  it('defaults emailVerified to false for Microsoft (no email_verified claim)', () => {
    const microsoft = {
      sub: 'm1',
      name: 'M User',
      email: 'user@outlook.com',
      picture: 'p',
      givenname: 'M',
      familyname: 'User',
    } as MicrosoftUserProps;

    expect(transformSocialUserData(microsoft).emailVerified).toBe(false);
  });

  it('throws when no email is present', () => {
    const microsoft = {
      sub: 'm2',
      name: 'M User',
      email: undefined,
      picture: 'p',
      givenname: 'M',
      familyname: 'User',
    } as MicrosoftUserProps;

    expect(() => transformSocialUserData(microsoft)).toThrow('no_email_found');
  });
});
