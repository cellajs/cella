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
 * Messages use translation keys from locales/en/error.json for OpenAPI examples.
 */
export const mockApiError = (status = 400): ApiError => ({
  name: 'BadRequestError',
  message: 'error:bad_request_action',
  type: 'validation_error',
  status,
  severity: 'warn',
  timestamp: '2025-01-01T12:00:00.000Z',
});
