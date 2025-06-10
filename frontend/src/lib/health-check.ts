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
      console.debug('Health check aborted.');
      return false;
    }

    attempts++;
    try {
      console.debug(`Attempt ${attempts}: Pinging ${url}`);
      const response = await fetch(url);
      if (response.ok) {
        console.debug('Health check successful!');
        return true;
      }
      console.debug(`Health check: ${response.status}`);
    } catch (err) {}

    if (delay < maxDelay * 1000) {
      delay = Math.min(maxDelay * 1000, delay * factor);
    }

    console.debug(`Waiting ${delay / 1000} seconds before next attempt.`);
    await sleep(delay);
  }

  console.debug('Maximum attempts reached. Health check failed.');
  return false;
};
