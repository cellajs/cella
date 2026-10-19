import { useState } from 'react';
import { HighlightText } from '~/modules/common/match-highlight';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';
import { getTypeColorClass, type JsonViewerTheme } from './types';
import { JSON_SCHEMA_TYPES } from './utils';

interface InlinePrimitiveValueProps {
  value: unknown;
  theme: { string: string; number: string; boolean: string; null: string };
}

export function InlinePrimitiveValue({ value, theme }: InlinePrimitiveValueProps) {
  if (value === null) return <span className={theme.null}>null</span>;
  if (typeof value === 'boolean' || typeof value === 'number') {
    return (
      <span className={typeof value === 'boolean' ? theme.boolean : theme.number}>
        <HighlightText text={String(value)} />
      </span>
    );
  }
  if (typeof value === 'string') {
    const quote = <span className="group-data-[openapi-mode=schema]/jv:hidden">"</span>;
    return (
      <span className={theme.string}>
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
  theme: Pick<JsonViewerTheme, 'string' | 'number' | 'boolean' | 'null' | 'schemaType' | 'structureType'>;
  collapseStringsAfterLength: number;
  openapiMode?: 'spec' | 'schema';
}

export function PrimitiveValue({ value, type, theme, collapseStringsAfterLength, openapiMode }: PrimitiveValueProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const baseClass = tw('wrap-break-word whitespace-pre-line');

  switch (type) {
    case 'string': {
      const str = String(value);

      // Schema-mode type keywords render unquoted and in their type color.
      if (openapiMode === 'schema' && JSON_SCHEMA_TYPES.has(str)) {
        return <span className={cn(baseClass, theme.schemaType, getTypeColorClass(str, theme))}>{str}</span>;
      }

      const shouldTruncate = str.length > collapseStringsAfterLength;
      const displayValue = !isExpanded && shouldTruncate ? str.slice(0, collapseStringsAfterLength) : str;
      const text = (
        <>
          <span className="group-data-[openapi-mode=schema]/jv:hidden">"</span>
          <span className={theme.string}>
            <HighlightText text={displayValue} />
          </span>
          {!isExpanded && shouldTruncate && <span className="text-muted-foreground">…</span>}
          <span className="group-data-[openapi-mode=schema]/jv:hidden">"</span>
        </>
      );
      const stringClass = cn(baseClass, 'inline-block max-w-[600px] align-top');
      if (!shouldTruncate) return <span className={stringClass}>{text}</span>;

      const toggle = () => setIsExpanded(!isExpanded);
      return (
        // biome-ignore lint/a11y/useSemanticElements: text inside a real button cannot be selected to copy, so the string stays a span.
        <span
          className={cn(stringClass, 'focus-effect cursor-pointer rounded')}
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          onClick={toggle}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            toggle();
          }}
          title={isExpanded ? 'Click to collapse' : 'Click to expand'}
        >
          {text}
        </span>
      );
    }
    case 'number':
      return (
        <span className={cn(baseClass, theme.number)}>
          <HighlightText text={String(value)} />
        </span>
      );
    case 'boolean':
      return (
        <span className={cn(baseClass, theme.boolean)}>
          <HighlightText text={String(value)} />
        </span>
      );
    case 'null':
      return <span className={cn(baseClass, theme.null)}>null</span>;
    case 'undefined':
      return <span className={cn(baseClass, theme.null)}>undefined</span>;
    default:
      return <span className={baseClass}>{String(value)}</span>;
  }
}
