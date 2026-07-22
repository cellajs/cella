import { appConfig } from 'shared';

/**
 * Returns a normalized same-origin redirect path or false.
 * It rejects absolute/scheme-relative URLs, authority tricks, encoded bypasses, control
 * characters, and backend routes so callers never replay untrusted input.
 */
export function isValidRedirectPath(path: unknown): string | false {
  if (typeof path !== 'string' || path.length === 0) return false;

  // Decode once so encoded bypasses (e.g. `%2F%2Fhost`) are evaluated as the
  // characters they actually represent.
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false; // malformed percent-encoding
  }

  // Must be a single-slash absolute path. Reject scheme-relative (`//host`) and
  // backslash authority tricks (`/\host`, `\\host`).
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

  // Return the normalized relative path only.
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
