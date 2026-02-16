type HealthCheckParams = {
  url: string;
  initDelay?: number;
  maxDelay?: number;
  factor?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
};

/**
 * Performs a health check by repeatedly pinging a backend URL with exponential backoff.
 *
 * @param params - Options for the health check:
 * @param params.url - URL to ping (required).
 * @param params.initDelay - Initial delay in ms before retrying. Default: 10000.
 * @param params.maxDelay - Max delay between retries in seconds. Default: 600.
 * @param params.factor - Backoff multiplier. Default: 1.5.
 * @param params.maxAttempts - Max number of attempts. Default: 10.
 * @param params.signal - Optional AbortSignal to cancel the check.
 *
 * @returns Promise resolving to `true` if the backend is reachable, else `false`.
 */

export const healthCheck = async ({
  url,
  initDelay = 10000,
  maxDelay = 600,
  factor = 1.5,
  maxAttempts = 10,
  signal,
}: HealthCheckParams): Promise<boolean> => {
  let delay = initDelay;
  let attempts = 0;

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  while (attempts < maxAttempts) {
    if (signal?.aborted) {
      console.debug('[HealthCheck] Aborted');
      return false;
    }

    attempts++;
    try {
      console.debug(`[HealthCheck] Attempt ${attempts}: Pinging ${url}`);
      const response = await fetch(url);
      if (response.ok) {
        console.debug('[HealthCheck] Successful');
        return true;
      }
      console.debug(`[HealthCheck] Response status: ${response.status}`);
    } catch (err) {}

    if (delay < maxDelay * 1000) {
      delay = Math.min(maxDelay * 1000, delay * factor);
    }

    console.debug(`[HealthCheck] Waiting ${delay / 1000}s before next attempt`);
    await sleep(delay);
  }

  console.debug('[HealthCheck] Maximum attempts reached, failed');
  return false;
};
