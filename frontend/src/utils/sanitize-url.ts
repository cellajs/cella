/**
 * Very small allowlist sanitizer for URLs used in <img src>, etc.
 */
export function sanitizeUrl(input: string): string {
  try {
    // Allow only http(s) and root-relative paths. Block javascript:, data:, etc.
    if (input.startsWith('/')) return input;
    const u = new URL(input, window.location.origin);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
  } catch {}
  return ''; // invalid → treat as empty
}
