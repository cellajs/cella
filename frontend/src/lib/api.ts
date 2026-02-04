import type { ClientErrorStatusCode, ServerErrorStatusCode } from 'hono/utils/http-status';
import type { EntityType, Severity } from 'shared';

export const clientConfig = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, credentials: 'include' }),
};

// Custom error class to handle API errors
export class ApiError extends Error {
  name: string;
  status: ClientErrorStatusCode | ServerErrorStatusCode;
  type?: string;
  entityType?: EntityType;
  severity?: Severity;
  logId?: string;
  path?: string;
  method?: string;
  timestamp?: string;
  userId?: string;
  organizationId?: string;
  meta?: { readonly [key: string]: number | string | boolean | null };

  constructor(error: ApiError) {
    super(error.message);
    this.name = error.name;
    this.status = error.status;
    this.type = error.type;
    this.entityType = error.entityType;
    this.severity = error.severity;
    this.logId = error.logId;
    this.path = error.path;
    this.method = error.method;
    this.timestamp = error.timestamp;
    this.userId = error.userId;
    this.organizationId = error.organizationId;
    this.meta = error.meta;
  }
}
