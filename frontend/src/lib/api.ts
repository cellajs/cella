import type { ClientErrorStatusCode, ServerErrorStatusCode } from 'hono/utils/http-status';
import type { ApiError as ApiErrorPayload } from 'sdk';

export const clientConfig = {
  // hey-api passes a Request object as the sole argument to fetch.
  // OTel FetchInstrumentation drops the second arg when the first is a Request,
  // so credentials must be on the Request itself, not as an init override.
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    if (input instanceof Request) {
      return fetch(new Request(input, { ...init, credentials: 'include' }));
    }
    return fetch(input, { ...init, credentials: 'include' });
  },
};

/** SDK API-error payload with a required, Hono-branded status and optional synthesized fields. */
export type ApiErrorInit = Partial<Omit<ApiErrorPayload, 'status'>> & {
  status: ClientErrorStatusCode | ServerErrorStatusCode;
};

/** Custom error class to handle API errors */
export class ApiError extends Error implements ApiErrorInit {
  name: string;
  status: ApiErrorInit['status'];
  type?: string;
  entityType?: ApiErrorPayload['entityType'];
  severity?: ApiErrorPayload['severity'];
  logId?: string;
  path?: string;
  method?: string;
  timestamp?: string;
  userId?: string;
  organizationId?: string;
  meta?: ApiErrorPayload['meta'];

  constructor(init: ApiErrorInit) {
    super(init.message ?? init.type ?? init.name ?? `HTTP ${init.status}`);
    this.name = init.name ?? init.type ?? 'ApiError';
    this.status = init.status;
    this.type = init.type;
    this.entityType = init.entityType;
    this.severity = init.severity;
    this.logId = init.logId;
    this.path = init.path;
    this.method = init.method;
    this.timestamp = init.timestamp;
    this.userId = init.userId;
    this.organizationId = init.organizationId;
    this.meta = init.meta;
  }
}
