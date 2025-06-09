import dayjs from 'dayjs';

/**
 * Formats a date into a relative time format.
 *
 * The formatting depends on the difference between the given date and the current date:
 * - Today, "Today, H:mm".
 * - Yesterday, "Yesterday, H:mm".
 * - Previous week, the day of the week and time, e.g. "Monday, H:mm".
 * - Last 3 months, the date in the format "MMM D, H:mm".
 * - Otherwise, the full date in the format "MMM D, YYYY".
 *
 * @param date - The date to format. Can be a string, Date object, or null.
 * @returns A formatted string representing the relative time or the full date.
 */
export const dateShort = (date?: string | null | Date) => {
  if (!date) return '-';
  const currentDate = dayjs.utc(date).local();

  return currentDate.calendar(null, {
    sameDay: '[Today], H:mm',
    lastDay: '[Yesterday], H:mm',
    lastWeek: 'dddd, H:mm',
    sameElse: (now: dayjs.Dayjs) => {
      const monthDiff = now.diff(currentDate, 'month');
      if (monthDiff <= 3) return currentDate.format('MMM D, H:mm');
      return currentDate.format('MMM D, YYYY');
    },
  });
};
