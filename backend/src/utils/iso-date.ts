/** ISO 8601, e.g. "2025-02-18T12:34:56.789Z". */
export const getIsoDate = () => new Date().toISOString();

/** The current time for a mail reader, e.g. "2025-02-18 12:34:56 UTC". */
export const utcStamp = () => `${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`;
