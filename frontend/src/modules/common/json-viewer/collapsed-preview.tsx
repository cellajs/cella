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
      <span className="text-muted-foreground mx-1.5 text-xs whitespace-nowrap italic">{t('c:item_count', { count: itemCount })}</span>
      <span className={jsonViewerTheme.bracket}>{closeBracket}</span>
      {hiddenMatchCount > 0 && (
        <span className={cn(jsonViewerTheme.matchBadge, 'ml-1.5 rounded px-1.5 py-0.5 text-sm font-medium')} title={t('c:matches_collapsed.text')}>
          {t('c:match_count', { count: hiddenMatchCount })}
        </span>
      )}
    </>
  );
}
