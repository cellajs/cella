import { HighlightText } from '~/modules/common/match-highlight';
import { cn } from '~/utils/cn';

interface KeyRendererProps {
  keyName?: string | number | false;
  showKeyQuotes: boolean;
  isObjectValue: boolean;
  hasSelfRequired: boolean;
  openapiMode?: 'spec' | 'schema';
  theme: { key: string; index: string; required: string };
}

export function KeyRenderer({ keyName, showKeyQuotes, isObjectValue, hasSelfRequired, openapiMode, theme }: KeyRendererProps) {
  if (keyName === false || keyName === undefined) return null;

  const keyStr = String(keyName);

  // Dictionary key from additionalProperties, written as [key].
  const isDictionaryKey = openapiMode === 'schema' && keyStr.startsWith('[') && keyStr.endsWith(']');

  const requiredLabel = hasSelfRequired && <span className={cn('ml-1.5 rounded px-1 py-0.5 font-medium text-xs', theme.required)}>required</span>;

  if (typeof keyName === 'number') {
    return <span className={theme.index}>{keyName}</span>;
  }

  return (
    <>
      <span
        className={cn(
          'font-medium',
          theme.key,
          isDictionaryKey ? 'text-muted-foreground! italic' : openapiMode === 'schema' && !isObjectValue ? 'text-muted-foreground!' : '',
        )}
      >
        <HighlightText text={showKeyQuotes && !isDictionaryKey ? `"${keyName}"` : keyName} />
      </span>
      {requiredLabel}
    </>
  );
}
