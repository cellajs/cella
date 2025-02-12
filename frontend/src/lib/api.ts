import type { Entity, Severity } from 'config';
import type { ClientResponse } from 'hono/client';
import type { ClientErrorStatusCode, ServerErrorStatusCode } from 'hono/utils/http-status';

type HttpErrorStatus = ClientErrorStatusCode | ServerErrorStatusCode;

/**
 * Handles an API response, parsing the JSON and throwing an error if necessary.
 *
 * If the response is successful, it returns the parsed JSON. If the response contains an error,
 * it throws an `ApiError` with the error details. Otherwise, it throws a generic error.
 *
 * @param response - Client response object to handle.
 * @returns Parsed JSON from response.
 * @throws ApiError for expected errors, generic error for unknown issues.
 */
// biome-ignore lint/suspicious/noExplicitAny: any is used to allow any type of response
export const handleResponse = async <T extends Record<string, any>, U extends ClientResponse<T, number, 'json'>>(response: U) => {
  const json = await response.json();

  if (response.ok) return json as Awaited<ReturnType<Extract<U, { status: 200 }>['json']>>;

  if ('error' in json) throw new ApiError(json.error);

  throw new Error('Unknown error');
};

export const clientConfig = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, {
      ...init,
      credentials: 'include',
    }),
};

// Custom error class to handle API errors
export class ApiError extends Error {
  status: HttpErrorStatus;
  type?: string;
  entityType?: Entity;
  severity?: Severity;
  logId?: string;
  path?: string;
  method?: string;
  timestamp?: string;
  usr?: string;
  org?: string;

  constructor(error: ApiError) {
    super(error.message);
    this.status = error.status;
    this.type = error.type;
    this.entityType = error.entityType;
    this.severity = error.severity;
    this.logId = error.logId;
    this.path = error.path;
    this.method = error.method;
    this.timestamp = error.timestamp;
    this.usr = error.usr;
    this.org = error.org;
  }
}
