import type { ClientErrorStatusCode, ServerErrorStatusCode } from 'hono/utils/http-status';
import type { ApiError as ApiErrorPayload } from 'sdk';

export const clientConfig = {
  // OTel FetchInstrumentation drops the init argument when the input is a Request, so credentials go on the Request.
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    if (input instanceof Request) {
      return fetch(new Request(input, { ...init, credentials: 'include' }));
    }
    return fetch(input, { ...init, credentials: 'include' });
  },
};

/** SDK API-error payload with a required, Hono-branded status and optional synthesized fields. */
export type ApiErrorInit = Partial<Omit<ApiErrorPayload, 'status'>> & { status: ClientErrorStatusCode | ServerErrorStatusCode };

/** The payload's fields are copied onto the error as they are; `declare` keeps them typed without emitting class fields. */
export class ApiError extends Error implements ApiErrorInit {
  declare status: ApiErrorInit['status'];
  declare type?: string;
  declare entityType?: ApiErrorPayload['entityType'];
  declare severity?: ApiErrorPayload['severity'];
  declare requestId?: string;
  declare path?: string;
  declare method?: string;
  declare timestamp?: string;
  declare userId?: string;
  declare organizationId?: string;
  declare meta?: ApiErrorPayload['meta'];

  constructor({ message, name, ...fields }: ApiErrorInit) {
    super(message ?? fields.type ?? name ?? `HTTP ${fields.status}`);
    Object.assign(this, fields);
    this.name = name ?? fields.type ?? 'ApiError';
  }
}

/**
 * The error for a response without the API's error body, as a proxy or load balancer sends one. A gateway status
 * (502, 503, 504) reads as the service being unavailable and any other 5xx as a server error; a 4xx gets no type, so
 * it is described by what its status means.
 */
export const apiErrorFromStatus = (status: number) => {
  const type = [502, 503, 504].includes(status) ? 'service_unavailable' : status >= 500 ? 'server_error' : undefined;
  return new ApiError({ status: status as ApiErrorInit['status'], type, severity: status >= 500 ? 'error' : 'warn' });
};
