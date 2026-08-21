import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { dateMini } from '~/utils/date-mini';

const minute = 6e4;
const hour = 36e5;
const day = 864e5;

const getDelay = (date: string) => {
  const age = dayjs().diff(dayjs.utc(date));
  if (age < minute) return 10_000;
  if (age < hour) return 30_000;
  if (age < day) return hour;
  return 0;
};

/** Relative date string that refreshes at 10s, 30s or 1h intervals, stops after a day, and follows the active language. */
export const useRelativeDate = (date: string, addStr?: string) => {
  const { i18n } = useTranslation();
  const language = i18n.language;
  const [text, setText] = useState(() => dateMini(date, addStr));

  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;

    const tick = () => {
      setText(dateMini(date, addStr));
      const ms = getDelay(date);
      if (ms) id = setTimeout(tick, ms);
    };

    tick();

    return () => clearTimeout(id);
  }, [date, addStr, language]);

  return text;
};
