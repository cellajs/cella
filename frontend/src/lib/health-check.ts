export const healthCheck = async (
  url: string,
  maxDelay = 600, // Maximum 10 minutes
  factor = 1.5,
  maxAttempts = 10,
): Promise<boolean> => {
  let delay = 10000; // Initial delay 10 second
  let attempts = 0;

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  while (attempts < maxAttempts) {
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

    console.log(`Waiting ${delay / 1000} seconds before next attempt.`);
    await sleep(delay);
  }

  console.log('Maximum attempts reached. Ping failed.');
  return false;
};
