/**
 * Checks if a file is stored locally by verifying if its key is a Blob URL.
 * Blob URLs typically start with 'blob:http', indicating a file stored in memory (e.g., from a file input).
 *
 * @param key - The file key or URL to check.
 * @returns True if the file is local (Blob URL), otherwise false.
 */
export const isFileLocal = (key: string) => key.startsWith('blob:http');
