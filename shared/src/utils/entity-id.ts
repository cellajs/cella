import { uuidv7 } from 'uuidv7';

/** UUID v7: time-ordered. */
export const generateId = uuidv7;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a string is a UUID in canonical form: hex groups only, so one never reads as a URL or a path. */
export const isUuid = (value: string): boolean => uuidPattern.test(value);
