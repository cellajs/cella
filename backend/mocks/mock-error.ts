/**
 * Mock generators for API error responses.
 * Used for OpenAPI examples and tests.
 *
 * Messages use translation keys from locales/en/error.json
 */

/** ApiError type matching apiErrorSchema structure */
interface ApiError {
  name: string;
  message: string;
  type: string;
  status: number;
  severity: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  entityType?: string;
  logId?: string;
  path?: string;
  method?: string;
  timestamp?: string;
  userId?: string;
  organizationId?: string;
}

/**
 * Generates a mock API error response.
 * Used for error schema examples.
 */
export const mockApiError = (status = 400): ApiError => ({
  name: 'BadRequestError',
  message: 'error:bad_request_action',
  type: 'validation_error',
  status,
  severity: 'warn',
  timestamp: '2025-01-01T12:00:00.000Z',
});

/**
 * Generates a mock 404 Not Found error.
 */
export const mockNotFoundError = (): ApiError => ({
  ...mockApiError(404),
  name: 'NotFoundError',
  message: 'error:not_found',
  type: 'not_found',
});

/**
 * Generates a mock 401 Unauthorized error.
 */
export const mockUnauthorizedError = (): ApiError => ({
  ...mockApiError(401),
  name: 'UnauthorizedError',
  message: 'error:unauthorized',
  type: 'unauthorized',
});

/**
 * Generates a mock 403 Forbidden error.
 */
export const mockForbiddenError = (): ApiError => ({
  ...mockApiError(403),
  name: 'ForbiddenError',
  message: 'error:forbidden',
  type: 'forbidden',
});

/**
 * Generates a mock 500 Internal Server Error.
 */
export const mockInternalServerError = (): ApiError => ({
  ...mockApiError(500),
  name: 'InternalServerError',
  message: 'error:server_error',
  type: 'internal_error',
  severity: 'error',
});
