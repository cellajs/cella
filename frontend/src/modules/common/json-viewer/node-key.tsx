import type { Ref } from 'react';
import { jsonViewerTheme } from '~/modules/common/json-viewer/theme';
import { HighlightText } from '~/modules/common/match-highlight';
import { cn } from '~/utils/cn';

interface NodeKeyProps {
  keyName: string | number | false;
  showKeyQuotes: boolean;
  isObjectValue: boolean;
  hasSelfRequired: boolean;
  openapiMode?: 'spec' | 'schema';
  ref?: Ref<HTMLSpanElement>;
}

const colon = <span className="mr-1 opacity-70">:</span>;

export function NodeKey({ keyName, showKeyQuotes, isObjectValue, hasSelfRequired, openapiMode, ref }: NodeKeyProps) {
  if (keyName === false) return null;

  if (typeof keyName === 'number') {
    return (
      <>
        <span ref={ref} className={jsonViewerTheme.index}>
          {keyName}
        </span>
        {colon}
      </>
    );
  }

  // Dictionary key from additionalProperties, written as [key].
  const isDictionaryKey = openapiMode === 'schema' && keyName.startsWith('[') && keyName.endsWith(']');

  return (
    <>
      <span
        ref={ref}
        className={cn(
          'font-medium',
          jsonViewerTheme.key,
          isDictionaryKey ? 'text-muted-foreground! italic' : openapiMode === 'schema' && !isObjectValue ? 'text-muted-foreground!' : '',
        )}
      >
        <HighlightText text={showKeyQuotes && !isDictionaryKey ? `"${keyName}"` : keyName} />
      </span>
      {hasSelfRequired && <span className={cn('ml-1.5 rounded px-1 py-0.5 font-medium text-xs', jsonViewerTheme.required)}>required</span>}
      {colon}
    </>
  );
}
