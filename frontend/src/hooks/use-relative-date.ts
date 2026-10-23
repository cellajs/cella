import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { dateMini, dayMs, hourMs, minuteMs } from '~/utils/date-mini';

const getDelay = (date: string) => {
  const age = dayjs().diff(dayjs.utc(date));
  if (age < minuteMs) return 10_000;
  if (age < hourMs) return 30_000;
  if (age < dayMs) return hourMs;
  return 0;
};

/** Relative date string that refreshes at 10s, 30s or 1h intervals, stops after a day, and follows the active language. */
export const useRelativeDate = (date: string, addStr?: string) => {
  const { i18n } = useTranslation();
  const language = i18n.language;
  const [text, setText] = useState(() => dateMini(date, addStr));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      setText(dateMini(date, addStr));
      const delay = getDelay(date);
      if (delay) timer = setTimeout(tick, delay);
    };

    tick();

    return () => clearTimeout(timer);
  }, [date, addStr, language]);

  return text;
};
