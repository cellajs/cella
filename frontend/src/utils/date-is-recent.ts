import dayjs from 'dayjs';

/**
 * Checks if the given date is within the past specified number of days (inclusive).
 *
 * @param date - Date to check.
 * @param days - Number of days to check against.
 * @returns  Boolean(date is within the range).
 */
export const dateIsRecent = (date: string | null, days: number) => {
  if (!date) return false;
  const convertedDate = new Date(date);
  // Calculate the date days ago and today using dayjs
  const daysAgo = dayjs().subtract(days, 'day');
  const today = dayjs();
  return dayjs(convertedDate).isBetween(daysAgo, today, null, '[]');
};
