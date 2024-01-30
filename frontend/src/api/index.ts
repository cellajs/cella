import type { AppRoute } from 'backend/server';
import { config } from 'config';
import { hc } from 'hono/client';

export class ApiError extends Error {
  status: string;

  constructor(status: number | string, message: string) {
    super(message);
    this.status = String(status);
  }
}

// Create a Hono client to make requests to the backend
export const client = hc<AppRoute>(config.backendUrl, {
  fetch: (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, {
      ...init,
      credentials: 'include',
    }),
});
