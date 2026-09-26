import { appConfig } from 'shared';
import { toSafeRedirectPath } from 'shared/utils/safe-redirect-path';
import { maxLength } from '#/db/utils/constraints';

/**
 * Normalized same-origin redirect path on the frontend, or false: the shared `toSafeRedirectPath` rules, capped at
 * `maxLength.field` so a validated path always fits the stored token columns.
 * @param path - Untrusted input: a request field, a stored token value or a cookie payload.
 * @returns The path to redirect to, or false when it is unsafe.
 */
export function isValidRedirectPath(path: unknown): string | false {
  return toSafeRedirectPath(path, { origin: appConfig.frontendUrl, maxLength: maxLength.field }) ?? false;
}
