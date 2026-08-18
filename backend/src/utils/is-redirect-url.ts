import { appConfig } from 'shared';
import { maxLength } from '#/db/utils/constraints';

/**
 * Normalized same-origin redirect path, or false. Rejects absolute and scheme-relative URLs, authority
 * tricks, encoded bypasses, control characters and backend routes. Capped at `maxLength.field` so a
 * validated path always fits the stored token columns.
 */
export function isValidRedirectPath(path: unknown): string | false {
  if (typeof path !== 'string' || path.length === 0 || path.length > maxLength.field) return false;

  // Decode once, so encoded bypasses such as `%2F%2Fhost` are evaluated as the characters they represent.
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false; // malformed percent-encoding
  }

  // Single-slash absolute path only: reject scheme-relative `//host` and backslash authority tricks.
  if (!decoded.startsWith('/')) return false;
  if (decoded.startsWith('//')) return false;
  if (decoded.startsWith('\\') || decoded[1] === '\\') return false;

  // Reject embedded control characters that can split paths/headers.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional guard against control chars
  if (/[\u0000-\u001f\u007f]/.test(decoded)) return false;

  // Resolve against the frontend origin and require it to stay same-origin.
  let resolved: URL;
  try {
    resolved = new URL(decoded, appConfig.frontendUrl);
  } catch {
    return false;
  }
  if (resolved.origin !== new URL(appConfig.frontendUrl).origin) return false;

  // Never redirect into backend-only routes.
  if (resolved.pathname.startsWith('/api/')) return false;

  // Normalization can re-encode and lengthen the input, so re-check the cap on the result.
  const normalized = `${resolved.pathname}${resolved.search}${resolved.hash}`;
  return normalized.length > maxLength.field ? false : normalized;
}
