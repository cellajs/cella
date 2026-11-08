/** Whether the moment has passed; an expiry equal to now counts as expired. */
export const isExpiredDate = (date: string | Date): boolean => Date.now() >= new Date(date).getTime();
