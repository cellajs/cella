// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what this refuses
const controlCharacters = /[\u0000-\u001f\u007f]/;
/** Backslashes (raw or encoded) and encoded slashes: browsers and servers disagree on whether they separate segments. */
const ambiguousSeparators = /\\|%5c|%2f/i;
const malformedPercent = /%(?![0-9a-f]{2})/i;
/** Any base works: only the path is returned, and an input that resolves off this base names a host of its own. */
const base = new URL('https://redirect.invalid');

/** Decodes each `%XX` for the backend-route check only; the returned path keeps its encoding. */
const decodePercents = (value: string) => value.replace(/%([0-9a-f]{2})/gi, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));

const isBackendRoute = (pathname: string) => {
  const path = decodePercents(pathname).toLowerCase();
  return path === '/api' || path.startsWith('/api/');
};

const normalizeRedirectPath = (input: unknown, maxLength: number): string | undefined => {
  if (typeof input !== 'string' || input.length === 0 || input.length > maxLength) return;
  if (!input.startsWith('/')) return;
  if (controlCharacters.test(input) || ambiguousSeparators.test(input) || malformedPercent.test(input)) return;

  let resolved: URL;
  try {
    resolved = new URL(input, base);
  } catch {
    return;
  }
  if (resolved.origin !== base.origin) return;

  // Checked after the URL parser removed dot segments, which is where `/..//host` turns into `//host`.
  const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
  if (path.startsWith('//') || isBackendRoute(resolved.pathname)) return;
  return path.length > maxLength ? undefined : path;
};

/**
 * The same-origin path a redirect may go to, or undefined. Rejects anything that could leave the origin or be read
 * differently further on: absolute and scheme-relative URLs, control characters, backslashes and encoded slashes,
 * malformed percent-encoding, and backend routes (`/api`). Dot segments are resolved before the checks. The result
 * validates to itself: a stored value means the same wherever it is checked again.
 * @param maxLength - Longest accepted input and result, in characters: the backend passes the length of the column that
 *   stores the path.
 */
export const safeRedirectPath = (input: unknown, maxLength = 2048): string | undefined => {
  const path = normalizeRedirectPath(input, maxLength);
  return path !== undefined && normalizeRedirectPath(path, maxLength) === path ? path : undefined;
};
