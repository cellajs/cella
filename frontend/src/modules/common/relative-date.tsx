import { useTranslation } from 'react-i18next';
import { useRelativeDate } from '~/hooks/use-relative-date';

/** How long ago `date` was, such as "2h ago", kept current while it is recent. */
export function RelativeDate({ date }: { date: string }) {
  const { t } = useTranslation();
  return useRelativeDate(date, t('c:ago'));
}
