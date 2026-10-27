/** Whether the moment has passed; an expiry equal to now counts as expired. */
export function isExpiredDate(date: string | Date): boolean {
  const timestamp = typeof date === 'string' ? new Date(date).getTime() : date.getTime();
  return Date.now() >= timestamp;
}
