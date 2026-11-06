/** An error type for each documented status, with the `title` and `detail` `AppError` gives it and the members it adds. */
const errorTexts = {
  400: { type: 'invalid_request', title: "Something's missing or wrong", detail: 'Check what you entered and try again.' },
  401: { type: 'unauthorized', title: 'Not signed in', detail: 'Sign in to continue.' },
  403: { type: 'forbidden', title: 'No access', detail: "You don't have permission to do this." },
  404: { type: 'not_found', title: 'Not found', detail: 'This resource does not exist or has been deleted.' },
  409: { type: 'user_mismatch', title: 'Signed in as someone else', detail: 'This link is for another account. Sign out, then open it again.' },
  413: { type: 'body_too_large', title: 'Too large to save', detail: 'Shorten it or split it up.' },
  429: { type: 'too_many_requests', title: 'Too many attempts', detail: 'Wait a moment, then try again.', retryAfter: 30 },
};

/** The body `AppError(status, <its type>, 'warn')` answers: the example of `ApiError` and of each error schema. */
export const mockApiError = (status: keyof typeof errorTexts = 400) => {
  const { type, title, detail, ...members } = errorTexts[status];
  return {
    type,
    title,
    status,
    detail,
    instance: 'f3a1c2d4-5b6e-4f70-8a9b-0c1d2e3f4a5b',
    severity: 'warn' as const,
    timestamp: '2025-01-01T12:00:00.000Z',
    ...members,
  };
};
