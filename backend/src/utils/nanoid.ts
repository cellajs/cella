import { customAlphabet } from 'nanoid';

/**
 * Generate a random (lowercase, alphanumerical) string. Default length is 24.
 */
export const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 24);

/**
 * Generate a 6-character lowercase alphanumeric ID for tenant IDs.
 * Short for URL-friendliness while maintaining sufficient entropy for collision resistance.
 */
export const nanoidLowercase = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 6);
