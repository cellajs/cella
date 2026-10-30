import i18n from 'i18next';
import { useState } from 'react';
import { getTypeColorClass, jsonViewerTheme } from '~/modules/common/json-viewer/theme';
import { jsonSchemaTypes } from '~/modules/common/json-viewer/utils';
import { HighlightText } from '~/modules/common/match-highlight/highlight-text';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

const quote = <span className="group-data-[openapi-mode=schema]/json-viewer:hidden">"</span>;

const baseClass = tw('wrap-break-word whitespace-pre-line');
// The row sets where it breaks. A deep row on a phone scrolls sideways before its text gets narrower than this.
const stringClass = cn(baseClass, 'min-w-24');

interface InlinePrimitiveValueProps {
  value: unknown;
}

export function InlinePrimitiveValue({ value }: InlinePrimitiveValueProps) {
  if (value === null) return <span className={jsonViewerTheme.null}>null</span>;
  if (typeof value === 'boolean' || typeof value === 'number') {
    return (
      <span className={typeof value === 'boolean' ? jsonViewerTheme.boolean : jsonViewerTheme.number}>
        <HighlightText text={String(value)} />
      </span>
    );
  }
  if (typeof value === 'string') {
    return (
      <span className={jsonViewerTheme.string}>
        {quote}
        <HighlightText text={value} />
        {quote}
      </span>
    );
  }

  return <span>{String(value)}</span>;
}

interface PrimitiveValueProps {
  value: unknown;
  type: string;
  collapseStringsAfterLength: number;
  openapiMode?: 'spec' | 'schema';
}

export function PrimitiveValue({ value, type, collapseStringsAfterLength, openapiMode }: PrimitiveValueProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  switch (type) {
    case 'string': {
      const str = String(value);

      // Schema-mode type keywords render unquoted and in their type color.
      if (openapiMode === 'schema' && jsonSchemaTypes.has(str)) {
        return <span className={cn(baseClass, jsonViewerTheme.schemaType, getTypeColorClass(str))}>{str}</span>;
      }

      const shouldTruncate = str.length > collapseStringsAfterLength;
      const displayValue = !isExpanded && shouldTruncate ? str.slice(0, collapseStringsAfterLength) : str;
      const text = (
        <>
          {quote}
          <span className={jsonViewerTheme.string}>
            <HighlightText text={displayValue} />
          </span>
          {!isExpanded && shouldTruncate && <span className="text-muted-foreground">…</span>}
          {quote}
        </>
      );
      if (!shouldTruncate) return <span className={stringClass}>{text}</span>;

      const toggle = () => setIsExpanded((prev) => !prev);
      return (
        // biome-ignore lint/a11y/useSemanticElements: text inside a real button cannot be selected to copy, so the string stays a span.
        <span
          className={cn(stringClass, 'focus-effect cursor-pointer rounded')}
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          onClick={toggle}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            toggle();
          }}
          title={i18n.t(isExpanded ? 'c:collapse' : 'c:expand')}
        >
          {text}
        </span>
      );
    }
    case 'number':
    case 'boolean':
      return (
        <span className={cn(baseClass, type === 'number' ? jsonViewerTheme.number : jsonViewerTheme.boolean)}>
          <HighlightText text={String(value)} />
        </span>
      );
    case 'null':
    case 'undefined':
      return <span className={cn(baseClass, jsonViewerTheme.null)}>{type}</span>;
    default:
      return <span className={baseClass}>{String(value)}</span>;
  }
}
