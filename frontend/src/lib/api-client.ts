import { onlineManager } from '@tanstack/react-query';
import type { CreateClientConfig } from 'sdk/client.gen';
import { appConfig } from 'shared';
import { currentSchemaVersion } from 'shared/schema-evolution';
import { ApiError, type ApiErrorInit, gatewayStatuses } from '~/lib/api';
import { recordReportedBudgets } from '~/lib/reported-budgets';
import { alertStore } from '~/modules/common/alerter/alert-store';
import { reportNetworkFailure, reportReachable } from '~/query/offline/connectivity';

/** The error for a response without the API's error body, as a proxy or load balancer sends one; a 4xx gets no type, so its status describes it. */
const apiErrorFromStatus = (status: number) => {
  const type = gatewayStatuses.has(status) ? 'service_unavailable' : status >= 500 ? 'server_error' : undefined;
  return new ApiError({ status: status as ApiErrorInit['status'], type, severity: status >= 500 ? 'error' : 'warn' });
};

/** The error of a failed response: its API error body, or {@link apiErrorFromStatus} for a body without a type. One that says the service is down raises the down alert. */
const failedResponseError = async (response: Response) => {
  const body: ApiErrorInit | null = await response.json().catch(() => null);
  const error = body?.type ? new ApiError(body) : apiErrorFromStatus(response.status);
  if (error.type === 'service_unavailable') alertStore.getState().setDownAlert(true);
  return error;
};

/** A request without a response by then starts the connectivity probe, or fails when offline: a link that drops packets leaves requests waiting. */
const responseWaitMs = 8000;

/**
 * A read without a response by then fails as unreachable, whatever the probe found: the API answers while this request's
 * own connection does not. A write keeps waiting: its upload is part of the wait, and one cut off may have been applied.
 */
const readLimitMs = 30_000;

/** One abort per request still waiting for its response. */
const waitingRequests = new Set<AbortController>();

/** Fails a waiting request as a network error: a write then pauses and is stored for replay, a read stops waiting. */
const abortUnreachable = (controller: AbortController) => controller.abort(new TypeError('Failed to fetch: the API is unreachable'));

onlineManager.subscribe((online) => {
  if (!online) for (const controller of waitingRequests) abortUnreachable(controller);
});

/** The one way to the API: reports what each answer says about the service, whichever call made the request, and throws a failed response as an {@link ApiError}. */
export const apiFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  // OTel FetchInstrumentation drops the init argument when the input is a Request, so credentials go on the Request.
  const request = new Request(input, { ...init, credentials: 'include' });
  request.headers.set('x-client-version', String(currentSchemaVersion));
  const unreachable = new AbortController();
  const slowResponse = setTimeout(() => (onlineManager.isOnline() ? void reportNetworkFailure() : abortUnreachable(unreachable)), responseWaitMs);
  const noResponse = ['GET', 'HEAD'].includes(request.method) ? setTimeout(() => abortUnreachable(unreachable), readLimitMs) : undefined;
  waitingRequests.add(unreachable);
  let response: Response;

  try {
    response = await fetch(new Request(request, { signal: AbortSignal.any([request.signal, unreachable.signal]) }));
  } catch (error) {
    // Network-level failure (no HTTP response), probe actual connectivity
    if (error instanceof TypeError) void reportNetworkFailure();
    throw error;
  } finally {
    clearTimeout(slowResponse);
    clearTimeout(noResponse);
    waitingRequests.delete(unreachable);
  }
  // A gateway answering for an absent API proves nothing, as the probe also reads it.
  if (!gatewayStatuses.has(response.status)) reportReachable();
  // Below 500 the API itself answered, so the service is back; a 5xx leaves a raised alert as it is.
  if (response.status < 500) alertStore.getState().setDownAlert(false);
  recordReportedBudgets(response.headers);

  if (response.ok) return response;
  throw await failedResponseError(response);
};

/** Runtime config for the generated API client (SDK output in /sdk/gen/): {@link https://heyapi.dev/openapi-ts/get-started} */
export const createClientConfig: CreateClientConfig = (baseConfig) => ({
  ...baseConfig,
  baseUrl: appConfig.backendUrl,
  responseStyle: 'data',
  throwOnError: true,
  fetch: apiFetch,
});
