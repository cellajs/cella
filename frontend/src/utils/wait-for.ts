/** Resolves after the requested delay. */
export const waitFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
