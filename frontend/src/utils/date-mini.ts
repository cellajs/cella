import dayjs from 'dayjs';
import { t } from 'i18next';

const secondMs = 1e3;
export const minuteMs = 6e4;
export const hourMs = 36e5;
export const dayMs = 864e5;
const yearMs = 31536e6;

/**
 * Distance from now as a minimal relative string: "now" (<1s), seconds (<1m), minutes (<1h), hours (<1d),
 * "MMM D" (<1y), else "MMM D, YYYY". Unit strings come from the `c:time_mini.*` keys; `ago` reads a relative one as `c:time_ago`.
 */
export const dateMini = (startDate: string, ago?: boolean) => {
  const start = dayjs.utc(startDate).local();
  const diff = Math.abs(dayjs().diff(start));

  let result: string;

  if (diff <= secondMs) return t('c:time_mini.now');
  if (diff < minuteMs) result = t('c:time_mini.seconds', { count: Math.floor(diff / secondMs) });
  else if (diff < hourMs) result = t('c:time_mini.minutes', { count: Math.floor(diff / minuteMs) });
  else if (diff < dayMs) result = t('c:time_mini.hours', { count: Math.floor(diff / hourMs) });
  else if (diff < yearMs) return start.format('MMM D');
  else return start.format('MMM D, YYYY');

  return ago ? t('c:time_ago', { time: result }) : result;
};
