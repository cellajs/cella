import { customAlphabet } from 'nanoid';

/**
 * Custom nanoid generator using only lowercase letters and numbers.
 */
export const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789');
