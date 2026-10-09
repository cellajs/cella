/** A flush could not hand its messages to the API. The changes are fine: the API is away. */
export class ApiUnreachableError extends Error {
  constructor() {
    super('The API is not reachable');
    this.name = 'ApiUnreachableError';
  }
}

/** SQLSTATE classes and codes of a server that is busy, restarting or out of reach, and of a lock or a snapshot lost to another session. */
const passingSqlstates = ['08', '53', '57P', '57014', '40001', '40P01', '55P03', '25P03'];

const networkCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH']);

/** What the database driver says when it has no code to give. */
const connectionPhrases = [
  'connection terminated',
  'connection refused',
  'connection reset',
  'could not connect',
  'too many clients',
  'timeout exceeded when trying to connect',
];

function hasErrorCode(value: unknown): value is { code: string } {
  return typeof value === 'object' && value !== null && 'code' in value && typeof (value as { code: unknown }).code === 'string';
}

/** Reads the PostgreSQL or network error code, unwrapping Drizzle-wrapped errors via `.cause`. */
function getErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  if (hasErrorCode(error)) return error.code;
  const cause = error instanceof Error ? error.cause : undefined;
  if (hasErrorCode(cause)) return cause.code;
  return null;
}

/**
 * Whether a failure says nothing about the change itself: the connection, the server's resources, a lock lost to
 * another session, or the API being away. The worker reads again after such a failure for as long as it lasts. Any
 * other failure means the database refused the change or the worker could not handle it.
 * @param error - What a flush or a message handler threw.
 * @returns True when reading the same change again can succeed without anyone changing anything.
 */
export function isPassingError(error: unknown): boolean {
  if (error instanceof ApiUnreachableError) return true;

  const code = getErrorCode(error);
  if (code) return networkCodes.has(code) || passingSqlstates.some((prefix) => code.startsWith(prefix));

  const messages = [error, error instanceof Error ? error.cause : undefined].map((item) => (item instanceof Error ? item.message.toLowerCase() : ''));
  return connectionPhrases.some((phrase) => messages.some((message) => message.includes(phrase)));
}
