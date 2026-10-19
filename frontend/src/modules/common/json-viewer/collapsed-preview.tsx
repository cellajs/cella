import { useTranslation } from 'react-i18next';
import { cn } from '~/utils/cn';

interface CollapsedPreviewProps {
  itemCount: number;
  closeBracket: string;
  hiddenMatchCount: number;
  displayDataTypes: boolean;
  typeLabel: string;
  theme: { bracket: string; matchBadge: string };
}

export function CollapsedPreview({ itemCount, closeBracket, hiddenMatchCount, displayDataTypes, typeLabel, theme }: CollapsedPreviewProps) {
  const { t } = useTranslation();
  return (
    <>
      <span className="mx-1.5 whitespace-nowrap text-muted-foreground text-xs italic">{t('c:item', { count: itemCount }).toLowerCase()}</span>
      <span className={cn('font-medium', theme.bracket, 'group-data-[openapi-mode=schema]/jv:hidden')}>{closeBracket}</span>
      {hiddenMatchCount > 0 && (
        <span className={cn('ml-1.5 rounded px-1.5 py-0.5 font-medium text-sm', theme.matchBadge)} title={t('c:matches_collapsed.text')}>
          {t('c:matches', { count: hiddenMatchCount })}
        </span>
      )}
      {displayDataTypes && <span className="ml-2 text-muted-foreground text-sm">{typeLabel}</span>}
    </>
  );
}
