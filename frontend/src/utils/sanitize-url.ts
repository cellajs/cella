/** Allows only http(s) URLs and root-relative paths; anything else (`javascript:`, `data:`, unparseable) returns ''. */
export function sanitizeUrl(input: string): string {
  try {
    if (input.startsWith('/')) return input;
    const u = new URL(input, window.location.origin);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
  } catch {}
  return '';
}
