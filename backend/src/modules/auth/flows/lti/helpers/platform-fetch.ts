import type { GuardedFetchInit } from '#/lib/guarded-fetch';

/** Tests answer from a fake platform; production reaches the platform through the guarded fetch's own. */
export type PlatformFetchOptions = Pick<GuardedFetchInit, 'resolve' | 'transport'>;

/** A platform's answer as JSON; undefined for one that does not parse. */
export const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};
