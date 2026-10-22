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
  const isMuted = isDictionaryKey || (openapiMode === 'schema' && !isObjectValue);

  return (
    <>
      <span ref={ref} className={cn('font-medium', isMuted ? 'text-muted-foreground' : jsonViewerTheme.key, isDictionaryKey && 'italic')}>
        <HighlightText text={showKeyQuotes && !isDictionaryKey ? `"${keyName}"` : keyName} />
      </span>
      {hasSelfRequired && <span className={cn(jsonViewerTheme.badge, jsonViewerTheme.required, 'ml-1.5')}>required</span>}
      {colon}
    </>
  );
}
