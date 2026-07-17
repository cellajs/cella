const REDACTED = '[REDACTED]';

/** Query keys whose values must never be logged/returned verbatim. */
const SENSITIVE_QUERY_KEYS = new Set([
  'token',
  'code',
  'state',
  'access_token',
  'id_token',
  'refresh_token',
  'code_verifier',
]);

/**
 * Path patterns whose trailing segment is a secret. Group 1 is the safe prefix
 * that is kept; the segment after it is redacted.
 * e.g. `/auth/invoke-token/magic/<TOKEN>` → `/auth/invoke-token/magic/[REDACTED]`.
 */
const SECRET_PATH_PATTERNS: RegExp[] = [/(\/auth\/invoke-token\/[^/]+\/)[^/?#]+/];

/** Redact the secret path segment(s) of a bare path. */
const scrubPathname = (pathname: string): string =>
  SECRET_PATH_PATTERNS.reduce((acc, re) => acc.replace(re, `$1${REDACTED}`), pathname);

/**
 * Redact secret path segments and sensitive query values from a URL or path.
 * Origin (scheme + host) is preserved when present; only the path and query are rewritten.
 */
export const scrubUrl = (input: string): string => {
  if (!input) return input;

  // Full URL (has a scheme/host): rewrite pathname + search, keep origin.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
    try {
      const url = new URL(input);
      url.pathname = scrubPathname(url.pathname);
      scrubSearchParams(url.searchParams);
      return url.toString();
    } catch {
      // Fall through to string handling for anything URL() cannot parse.
    }
  }

  // Bare path (optionally with query and/or fragment).
  const hashIndex = input.indexOf('#');
  const fragment = hashIndex === -1 ? '' : input.slice(hashIndex);
  const withoutFragment = hashIndex === -1 ? input : input.slice(0, hashIndex);

  const queryIndex = withoutFragment.indexOf('?');
  const pathname = queryIndex === -1 ? withoutFragment : withoutFragment.slice(0, queryIndex);
  const scrubbedPath = scrubPathname(pathname);

  if (queryIndex === -1) return scrubbedPath + fragment;

  const params = new URLSearchParams(withoutFragment.slice(queryIndex + 1));
  scrubSearchParams(params);
  const query = params.toString();
  return `${scrubbedPath}${query ? `?${query}` : ''}${fragment}`;
};

/** Convenience alias for callers that pass a path (e.g. `ctx.req.path`). */
export const scrubPath = (path: string): string => scrubUrl(path);

function scrubSearchParams(params: URLSearchParams): void {
  for (const key of [...params.keys()]) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) params.set(key, REDACTED);
  }
}
