import dayjs from 'dayjs';
import locale from '~/../../locales';

const second = 1e3;
const minute = 6e4;
const hour = 36e5;
const day = 864e5;
// const week = 6048e5;
// const month = 2592e6;
const year = 31536e6;

// convert date in into a minimal 'Twitter format'
export const dateMini = (startDate: string, passedLoc: keyof typeof locale, addStr?: string) => {
  const start = dayjs(startDate);
  const end = dayjs();
  const diff = Math.abs(end.diff(start));

  const loc = locale[passedLoc];
  let unit: keyof typeof loc;
  let num: number | string;

  if (diff <= second) {
    unit = 'now';
    num = ''; // No number needed for "now"
  } else if (diff < minute) {
    unit = 'seconds';
    num = Math.floor(diff / second);
  } else if (diff < hour) {
    unit = 'minutes';
    num = Math.floor(diff / minute);
  } else if (diff < day) {
    unit = 'hours';
    num = Math.floor(diff / hour);
  } else if (diff < year) {
    return start.format('MMM D');
  } else {
    return start.format('MMM D, YYYY');
  }

  if (unit === 'now') return loc[unit];
  const result = loc[unit].replace('%d', num.toString());
  return addStr ? `${result} ${addStr}` : result;
};
