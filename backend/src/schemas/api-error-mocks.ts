/** Messages are translation keys from locales/en/error.json. */
export const mockApiError = (status = 400) => ({
  name: 'BadRequestError',
  message: 'error:bad_request_action',
  type: 'validation_error',
  status,
  severity: 'warn' as const,
  timestamp: '2025-01-01T12:00:00.000Z',
});
