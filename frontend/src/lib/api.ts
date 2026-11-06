import type { ClientErrorStatusCode, ServerErrorStatusCode } from 'hono/utils/http-status';
import type { ApiError as ApiErrorPayload } from 'sdk';
import { isSessionLost } from 'shared/utils/session-lost';

/** The Problem Details members every error body may set; any other member is an extension member. */
type ProblemFields = Pick<
  ApiErrorPayload,
  'type' | 'title' | 'detail' | 'instance' | 'severity' | 'entityType' | 'version' | 'path' | 'method' | 'timestamp'
>;

/** An error body (RFC 9457) with a required, Hono-branded status; a client-made error sets only what it knows. */
export type ApiErrorInit = Partial<ProblemFields> & {
  status: ClientErrorStatusCode | ServerErrorStatusCode;
  [member: string]: ApiErrorPayload[string];
};

/**
 * `title` becomes the error's `name` and `detail` its `message`; every other member, extension members such as
 * `retryAfter` included, is copied onto the error as it is. `declare` keeps them typed without emitting class fields.
 */
export class ApiError extends Error {
  [member: string]: unknown;
  declare status: ApiErrorInit['status'];
  declare type?: ProblemFields['type'];
  declare instance?: ProblemFields['instance'];
  declare entityType?: ProblemFields['entityType'];
  declare severity?: ProblemFields['severity'];
  declare version?: ProblemFields['version'];
  declare path?: ProblemFields['path'];
  declare method?: ProblemFields['method'];
  declare timestamp?: ProblemFields['timestamp'];

  constructor({ detail, title, ...fields }: ApiErrorInit) {
    super(detail ?? fields.type ?? title ?? `HTTP ${fields.status}`);
    Object.assign(this, fields);
    this.name = title ?? fields.type ?? 'ApiError';
  }
}

/** What a load balancer or proxy answers while the API behind it is down or too slow, as during a deploy. */
export const gatewayStatuses: ReadonlySet<number> = new Set([502, 503, 504]);

/** Whether the global error handler signs the tab out over this refusal: a lost session's 401, except on an auth page. */
export const tearsDownSession = (error: ApiError): boolean => isSessionLost(error) && !location.pathname.startsWith('/auth/');
