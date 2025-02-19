/**
 * Get the current ISO 8601 date string.
 *
 * Returns the current date and time as a string in ISO 8601 format (e.g. "2025-02-18T12:34:56.789Z").
 *
 * @returns Current ISO date string.
 */
export const getIsoDate = () => new Date().toISOString();
