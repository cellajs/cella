import dayjs from 'dayjs';
import i18n from 'i18next';

/**
 * Formats a date as a full exact timestamp in the active language: "Thursday, Aug 20, 2026, 14:32". Meant for tooltips on
 * relative or shortened dates. Returns null for a nullish date.
 */
export const dateFull = (date?: string | null | Date) => {
  if (!date) return null;
  const local = dayjs.utc(date).local();
  const day = local.toDate().toLocaleDateString(i18n.language, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  return `${day}, ${local.format('H:mm')}`;
};
