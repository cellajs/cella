/**
 * Parse a JSON response body, treating an empty body as `{}`. Returns a partial
 * shape because callers destructure optional fields off the result.
 */
export function parseJsonBody<T>(body: string): Partial<T> {
  return (body === '' ? {} : JSON.parse(body)) as Partial<T>
}
