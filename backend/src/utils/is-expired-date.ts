/**
 * Check if a date is NOT within now and expiration date
 */
export function isExpiredDate(date: Date): boolean {
  return !(Date.now() < date.getTime());
}
