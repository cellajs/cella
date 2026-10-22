import { useTranslation } from 'react-i18next';
import { jsonViewerTheme } from '~/modules/common/json-viewer/theme';
import { cn } from '~/utils/cn';

interface CollapsedPreviewProps {
  itemCount: number;
  closeBracket: string;
  hiddenMatchCount: number;
}

export function CollapsedPreview({ itemCount, closeBracket, hiddenMatchCount }: CollapsedPreviewProps) {
  const { t } = useTranslation();
  return (
    <>
      <span className="mx-1.5 whitespace-nowrap text-muted-foreground text-xs italic">{t('c:item', { count: itemCount }).toLowerCase()}</span>
      <span className={jsonViewerTheme.bracket}>{closeBracket}</span>
      {hiddenMatchCount > 0 && (
        <span className={cn(jsonViewerTheme.matchBadge, 'ml-1.5 rounded px-1.5 py-0.5 font-medium text-sm')} title={t('c:matches_collapsed.text')}>
          {t('c:matches', { count: hiddenMatchCount })}
        </span>
      )}
    </>
  );
}
