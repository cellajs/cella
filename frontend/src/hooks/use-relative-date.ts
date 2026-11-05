import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type DateMiniOptions, dateMini, dayMs, hourMs, minuteMs } from '~/utils/date-mini';

const getDelay = (date: string, compact?: boolean) => {
  const age = dayjs().diff(dayjs.utc(date));
  if (age < minuteMs) return 10_000;
  if (age < hourMs) return 30_000;
  // A date past a day stays put, a compact count goes on: "1d" turns "2d"
  if (age < dayMs || compact) return hourMs;
  return 0;
};

/** Relative date string that refreshes at 10s, 30s or 1h intervals, stops after a day unless compact, and follows the active language. */
export const useRelativeDate = (date: string, { ago, compact }: DateMiniOptions = {}) => {
  const { i18n } = useTranslation();
  const language = i18n.language;
  const [text, setText] = useState(() => dateMini(date, { ago, compact }));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      setText(dateMini(date, { ago, compact }));
      const delay = getDelay(date, compact);
      if (delay) timer = setTimeout(tick, delay);
    };

    tick();

    return () => clearTimeout(timer);
  }, [date, ago, compact, language]);

  return text;
};
