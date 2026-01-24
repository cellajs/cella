/**
 * Check if a date string is expired (past current time).
 */
export function isExpiredDate(date: string | Date): boolean {
  const timestamp = typeof date === 'string' ? new Date(date).getTime() : date.getTime();
  return Date.now() >= timestamp;
}
