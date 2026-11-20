import { useTranslation } from 'react-i18next';
import { DateTooltip } from '~/modules/common/date-tooltip';
import { clockTime } from '~/utils/date-short';

interface LtiToolOriginProps {
  createdAt: string;
  /** Left out where the line beside it names them already. */
  launchOrigins?: string[];
}

/**
 * What tells two LTI tools of one name apart: the hosts their launches go to, which an approval trusts, and the moment
 * each was added.
 */
export function LtiToolOrigin({ createdAt, launchOrigins }: LtiToolOriginProps) {
  const { t, i18n } = useTranslation();
  const added = new Date(createdAt);
  // A date with its year, never "Today": the moment reads inside the line
  const date = `${added.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })}, ${clockTime(added)}`;
  const hosts = launchOrigins?.map((origin) => new URL(origin).host).join(', ');
  return (
    <span className="text-muted-foreground min-w-0 truncate text-xs font-normal">
      {hosts && `${hosts} · `}
      <DateTooltip date={createdAt}>
        <span>{t('c:added_on', { date })}</span>
      </DateTooltip>
    </span>
  );
}

/** Whether another of `items` carries a name, compared without regard to case and surrounding spaces. */
export const sharesNameAmong = (items: { name: string }[]) => {
  const counts = new Map<string, number>();
  const key = (name: string) => name.trim().toLocaleLowerCase();
  for (const { name } of items) counts.set(key(name), (counts.get(key(name)) ?? 0) + 1);
  return (name: string) => (counts.get(key(name)) ?? 0) > 1;
};
