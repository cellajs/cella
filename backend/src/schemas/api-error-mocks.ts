/** The body `AppError(400, 'invalid_request', 'warn')` answers: the type's title as `name`, its text as `message`. */
export const mockApiError = () => ({
  name: "Something's missing or wrong",
  message: 'Check what you entered and try again.',
  type: 'invalid_request',
  status: 400,
  severity: 'warn' as const,
  timestamp: '2025-01-01T12:00:00.000Z',
});
