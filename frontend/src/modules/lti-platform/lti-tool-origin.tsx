import { useTranslation } from 'react-i18next';
import { DateTooltip } from '~/modules/common/date-tooltip';
import { dateShort } from '~/utils/date-short';

/** What tells two LTI tools of one name apart: the domain each names itself by and when it was added. */
export function LtiToolOrigin({ domain, createdAt }: { domain: string; createdAt: string }) {
  const { t } = useTranslation();
  return (
    <span className="text-muted-foreground min-w-0 truncate text-xs font-normal">
      {domain}
      {' · '}
      <DateTooltip date={createdAt}>
        <span>{t('c:added_on', { date: dateShort(createdAt) })}</span>
      </DateTooltip>
    </span>
  );
}

/** The names that more than one of `items` carries. */
export const sharedNames = (items: { name: string }[]) =>
  new Set(items.filter((item, index) => items.some((other, otherIndex) => otherIndex !== index && other.name === item.name)).map(({ name }) => name));
