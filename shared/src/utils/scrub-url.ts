const REDACTED = '[REDACTED]';

/**
 * Query keys whose value is a secret, matched case-insensitively: the app's own tokens (magic link, unsubscribe, Yjs),
 * OAuth and OIDC parameters, and the keys OpenTelemetry's HTTP instrumentation redacts by default (signed storage URLs).
 */
const sensitiveQueryKeys = [
  'token',
  'code',
  'state',
  'access_token',
  'id_token',
  'id_token_hint',
  'refresh_token',
  'code_verifier',
  'client_secret',
  'sig',
  'signature',
  'awsaccesskeyid',
  'x-goog-signature',
  'x-amz-signature',
  'x-amz-credential',
  'x-amz-security-token',
];

/** Route templates whose `{token}` segment is a secret. They match anywhere in a path, so a mount prefix such as `/api` may precede them. */
const secretPathTemplates = ['/auth/invoke-token/{type}/{token}'];

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Group 1 keeps the route up to the secret segment; any other `{param}` matches one segment, empty included. */
const toSecretPathPattern = (template: string): RegExp => {
  const [head = ''] = template.split('{token}');
  const prefix = head
    .split(/\{[^}]+\}/)
    .map(escapeRegExp)
    .join('[^/?#\\s]*');
  return new RegExp(`(${prefix})[^/?#\\s]+`, 'gi');
};

const secretPathPatterns = secretPathTemplates.map(toSecretPathPattern);

/** A sensitive key opening a bare query string, or following `?`, `&` or `#`, with its value up to the next separator. */
const sensitiveQueryPattern = new RegExp(
  `(^|[?&#])(${sensitiveQueryKeys.map(escapeRegExp).join('|')})=[^&#\\s]*`,
  'gi',
);

/** The userinfo of a URL authority (`scheme://user:password@`). */
const userinfoPattern = /(:\/\/)[^/?#@\s]+@/g;

/**
 * Redacts secrets from a URL, a path, a bare query string or any text that contains them: the value of every sensitive
 * query key, the secret segment of known token routes, and URL userinfo. Everything else is kept byte for byte, so logs
 * and spans still show the route and the harmless parameters.
 */
export const scrubUrl = (input: string): string => {
  if (!input) return input;
  let scrubbed = input.replace(userinfoPattern, `$1${REDACTED}@`);
  for (const pattern of secretPathPatterns) scrubbed = scrubbed.replace(pattern, `$1${REDACTED}`);
  return scrubbed.replace(sensitiveQueryPattern, `$1$2=${REDACTED}`);
};
