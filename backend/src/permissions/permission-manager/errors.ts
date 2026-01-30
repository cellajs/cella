/**
 * Error thrown when permission checking encounters invalid input or configuration.
 * These are programming/config errors that should be fixed, not runtime conditions.
 */
export class PermissionError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_SUBJECT' | 'INVALID_MEMBERSHIP' | 'CONFIG_ERROR' | 'UNKNOWN_ROLE',
    public readonly details?: Record<string, unknown>,
  ) {
    super(`[PermissionError:${code}] ${message}`);
    this.name = 'PermissionError';
  }
}
