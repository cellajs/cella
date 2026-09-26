export interface SafeRedirectPathOptions {
  /** Origin the path must stay on: the frontend URL, or `window.location.origin` in the browser. */
  origin: string;
  /** Longest accepted input and result, in characters. Default 2048. */
  maxLength?: number;
  /** Path prefixes never redirected to, compared case-insensitively on the decoded path. Default `['/api/']`. */
  denyPrefixes?: readonly string[];
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what this refuses
const controlCharacters = /[\u0000-\u001f\u007f]/;
/** Backslashes (raw or encoded) and encoded slashes: browsers and servers disagree on whether they separate segments. */
const ambiguousSeparators = /\\|%5c|%2f/i;
const malformedPercent = /%(?![0-9a-f]{2})/i;

/** Decodes each `%XX` for the deny check only; the returned path keeps its encoding. */
const decodePercents = (value: string) =>
  value.replace(/%([0-9a-f]{2})/gi, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));

const isDenied = (pathname: string, denyPrefixes: readonly string[]) => {
  const path = decodePercents(pathname).toLowerCase();
  return denyPrefixes.some((prefix) => {
    const deny = prefix.toLowerCase();
    return path.startsWith(deny) || (deny.endsWith('/') && path === deny.slice(0, -1));
  });
};

const normalizeRedirectPath = (input: unknown, options: SafeRedirectPathOptions): string | null => {
  const { maxLength = 2048, denyPrefixes = ['/api/'] } = options;
  if (typeof input !== 'string' || input.length === 0 || input.length > maxLength) return null;
  if (!input.startsWith('/')) return null;
  if (controlCharacters.test(input) || ambiguousSeparators.test(input) || malformedPercent.test(input)) return null;

  let base: URL;
  let resolved: URL;
  try {
    base = new URL(options.origin);
    resolved = new URL(input, base);
  } catch {
    return null;
  }
  if (resolved.origin !== base.origin || resolved.username || resolved.password) return null;

  // Checked after the URL parser removed dot segments, which is where `/..//host` turns into `//host`.
  const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
  if (path.startsWith('//') || isDenied(resolved.pathname, denyPrefixes)) return null;
  return path.length > maxLength ? null : path;
};

/**
 * The same-origin path a redirect may go to, or null. Rejects anything that could leave the origin or be read
 * differently further on: absolute and scheme-relative URLs, control characters, backslashes and encoded slashes,
 * malformed percent-encoding, and deny-listed prefixes (backend routes). Dot segments are resolved before the checks,
 * and the result must validate to itself, so a stored value means the same wherever it is checked again.
 */
export const toSafeRedirectPath = (input: unknown, options: SafeRedirectPathOptions): string | null => {
  const path = normalizeRedirectPath(input, options);
  return path !== null && normalizeRedirectPath(path, options) === path ? path : null;
};
