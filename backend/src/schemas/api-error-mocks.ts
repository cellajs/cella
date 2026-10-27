/** An error type for each documented status, with the `name` and `message` `AppError` gives it: its title and text. */
const errorTexts = {
  400: { name: "Something's missing or wrong", message: 'Check what you entered and try again.', type: 'invalid_request' },
  401: { name: 'Not signed in', message: 'Sign in to continue.', type: 'unauthorized' },
  403: { name: 'No access', message: "You don't have permission to do this.", type: 'forbidden' },
  404: { name: 'Not found', message: 'This resource does not exist or has been deleted.', type: 'not_found' },
  409: { name: 'Signed in as someone else', message: 'This link is for another account. Sign out, then open it again.', type: 'user_mismatch' },
  429: { name: 'Too many attempts', message: 'Wait a moment, then try again.', type: 'too_many_requests' },
};

/** The body `AppError(status, <its type>, 'warn')` answers: the example of `ApiError` and of each error schema. */
export const mockApiError = (status: keyof typeof errorTexts = 400) => ({
  ...errorTexts[status],
  status,
  severity: 'warn' as const,
  timestamp: '2025-01-01T12:00:00.000Z',
});
