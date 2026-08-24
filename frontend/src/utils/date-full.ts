import dayjs from 'dayjs';

/**
 * Formats a date as a full exact timestamp: "Thursday, Aug 20, 2026, 14:32". Meant for tooltips on
 * relative or shortened dates. Returns null for a nullish date.
 */
export const dateFull = (date?: string | null | Date) => {
  if (!date) return null;
  return dayjs.utc(date).local().format('dddd, MMM D, YYYY, H:mm');
};
