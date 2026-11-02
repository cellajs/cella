import type { ClientErrorStatusCode, ServerErrorStatusCode } from 'hono/utils/http-status';
import type { ApiError as ApiErrorPayload } from 'sdk';
import { isSessionLost } from 'shared/utils/session-lost';

/** SDK API-error payload with a required, Hono-branded status and optional synthesized fields. */
export type ApiErrorInit = Partial<Omit<ApiErrorPayload, 'status'>> & { status: ClientErrorStatusCode | ServerErrorStatusCode };

/** The payload's fields are copied onto the error as they are; `declare` keeps them typed without emitting class fields. */
export class ApiError extends Error implements ApiErrorInit {
  declare status: ApiErrorInit['status'];
  declare type?: string;
  declare entityType?: ApiErrorPayload['entityType'];
  declare severity?: ApiErrorPayload['severity'];
  declare requestId?: string;
  declare version?: string;
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

/** What a load balancer or proxy answers while the API behind it is down or too slow, as during a deploy. */
export const gatewayStatuses: ReadonlySet<number> = new Set([502, 503, 504]);

/** Whether the global error handler signs the tab out over this refusal: a lost session's 401, except on an auth page. */
export const tearsDownSession = (error: ApiError): boolean => isSessionLost(error) && !location.pathname.startsWith('/auth/');
