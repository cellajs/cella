import dayjs from 'dayjs';

/**
 * Formats a date as a short relative string: "Today, H:mm", "Yesterday, H:mm", weekday within the
 * last week, "MMM D, H:mm" within ~3 months, else "MMM D, YYYY". Returns null for a nullish date.
 */
export const dateShort = (date?: string | null | Date) => {
  if (!date) return null;
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
