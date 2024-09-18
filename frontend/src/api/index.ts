import { config } from 'config';
import type { ClientResponse } from 'hono/client';
import { hcWithType } from '#/hc';
import type { ErrorType } from '#/lib/errors';
import type { Entity } from '#/types/common';

// Custom error class to handle API errors
export class ApiError extends Error {
  status: string | number;
  type?: string;
  entityType?: Entity;
  severity?: string;
  logId?: string;
  path?: string;
  method?: string;
  timestamp?: string;
  usr?: string;
  org?: string;

  constructor(error: ErrorType) {
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

// biome-ignore lint/suspicious/noExplicitAny: any is used to handle any type of response
export const handleResponse = async <T extends Record<string, any>, U extends ClientResponse<T, number, 'json'>>(response: U) => {
  if (response.ok) {
    const json = await response.json();
    return json as Awaited<ReturnType<Extract<U, { status: 200 }>['json']>>;
  }

  const json = await response.json();
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

// Create Hono clients to make requests to the backend
export const apiClient = hcWithType(config.backendUrl, clientConfig);
