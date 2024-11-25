import dayjs from 'dayjs';

// Check if the passed date is between passed number of days and today(inclusive)
export const dateIsRecent = (date: string | null, days: number) => {
  if (!date) return false;
  const convertedDate = new Date(date);
  // Calculate the date days ago and today using dayjs
  const daysAgo = dayjs().subtract(days, 'day');
  const today = dayjs();
  return dayjs(convertedDate).isBetween(daysAgo, today, null, '[]');
};
