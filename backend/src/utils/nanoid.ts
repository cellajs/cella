import { customAlphabet } from 'nanoid';
/**
 * Generate a random (lowercase, alphanumerical) string. Default length is 24.
 */
export const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 24);
