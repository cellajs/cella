import { customAlphabet } from 'nanoid';

// nanoid with only lowercase letters and numbers
export const nanoid: (size?: number | undefined) => string = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789');
