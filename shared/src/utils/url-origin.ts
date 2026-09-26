const parseUrl = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const isWebUrl = (url: URL) => url.protocol === 'https:' || url.protocol === 'http:';

/**
 * True when `url` parses to exactly one of `origins`: same scheme, host and port, and no userinfo. Comparing parsed
 * origins, never string prefixes, keeps `<origin>@evil.example` and `<origin>.evil.example` out. `http:` passes only
 * for an allowed origin that is itself `http:` (a local development server); unparseable allowed origins are skipped.
 */
export const isOriginIn = (url: string, origins: readonly string[]): boolean => {
  const parsed = parseUrl(url);
  if (!parsed || !isWebUrl(parsed) || parsed.username || parsed.password) return false;

  return origins.some((origin) => {
    const allowed = parseUrl(origin);
    return !!allowed && isWebUrl(allowed) && allowed.origin === parsed.origin;
  });
};
