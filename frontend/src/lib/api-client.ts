import type { CreateClientConfig } from 'sdk/client.gen';
import { appConfig } from 'shared';
import { currentSchemaVersion } from 'shared/schema-evolution';
import { ApiError, type ApiErrorInit, gatewayStatuses } from '~/lib/api';
import { alertStore } from '~/modules/common/alerter/alert-store';
import { reportNetworkFailure, reportReachable } from '~/query/offline/connectivity';

/**
 * The error for a response without the API's error body, as a proxy or load balancer sends one. A gateway status reads
 * as the service being unavailable and any other 5xx as a server error; a 4xx gets no type, so it is described by what
 * its status means.
 */
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

/** The one way to the API: reports what each answer says about the service, whichever call made the request, and throws a failed response as an {@link ApiError}. */
export const apiFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  // OTel FetchInstrumentation drops the init argument when the input is a Request, so credentials go on the Request.
  const request = new Request(input, { ...init, credentials: 'include' });
  request.headers.set('x-client-version', String(currentSchemaVersion));
  let response: Response;

  try {
    response = await fetch(request);
  } catch (error) {
    // Network-level failure (no HTTP response), probe actual connectivity
    if (error instanceof TypeError) void reportNetworkFailure();
    throw error;
  }
  // A gateway answering for an absent API proves nothing, as the probe also reads it.
  if (!gatewayStatuses.has(response.status)) reportReachable();
  // Below 500 the API itself answered, so the service is back; a 5xx leaves a raised alert as it is.
  if (response.status < 500) alertStore.getState().setDownAlert(false);

  if (response.ok) return response;
  throw await failedResponseError(response);
};

/**
 * Runtime config for the generated API client (SDK output in /sdk/gen/).
 * @link https://heyapi.dev/openapi-ts/get-started
 */
export const createClientConfig: CreateClientConfig = (baseConfig) => ({
  ...baseConfig,
  baseUrl: appConfig.backendUrl,
  responseStyle: 'data',
  throwOnError: true,
  fetch: apiFetch,
});
