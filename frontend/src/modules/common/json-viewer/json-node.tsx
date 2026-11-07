import i18n from 'i18next';
import { ChevronRightIcon, CopyIcon } from 'lucide-react';
import { type MouseEvent, memo, type Ref, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isRecord } from 'shared/utils/as-record';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { CopiedIcon } from '~/modules/common/copied-icon';
import { useJsonViewerContext } from '~/modules/common/json-viewer/context';
import { SchemaLabels } from '~/modules/common/json-viewer/schema-labels';
import { jsonViewerTheme } from '~/modules/common/json-viewer/theme';
import { useNodeExpansion } from '~/modules/common/json-viewer/use-node-expansion';
import { describeNode, isDescriptionKeyword, type JsonPath, matchRowPaths } from '~/modules/common/json-viewer/utils';
import { HighlightText } from '~/modules/common/match-highlight/highlight-text';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

interface NodeKeyProps {
  keyName: string | number | false;
  showKeyQuotes: boolean;
  isObjectValue: boolean;
  hasSelfRequired: boolean;
  openapiMode?: 'spec' | 'schema';
  ref?: Ref<HTMLSpanElement>;
}

const colon = <span className="text-faint-foreground mr-1">:</span>;

function getValueType(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

const jsonSchemaTypes = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object', 'null']);

function NodeKey({ keyName, showKeyQuotes, isObjectValue, hasSelfRequired, openapiMode, ref }: NodeKeyProps) {
  if (keyName === false) return null;

  if (typeof keyName === 'number') {
    return (
      <span>
        <span ref={ref} className={jsonViewerTheme.index}>
          {keyName}
        </span>
        {colon}
      </span>
    );
  }

  // Dictionary key from additionalProperties, written as [key].
  const isDictionaryKey = openapiMode === 'schema' && keyName.startsWith('[') && keyName.endsWith(']');
  const isMuted = isDictionaryKey || (openapiMode === 'schema' && !isObjectValue);

  return (
    // One unit, so the colon never wraps away from its key
    <span className="wrap-anywhere">
      <span ref={ref} className={cn(isMuted ? 'text-muted-foreground' : jsonViewerTheme.key, isDictionaryKey && 'italic')}>
        <HighlightText text={showKeyQuotes && !isDictionaryKey ? `"${keyName}"` : keyName} />
      </span>
      {hasSelfRequired && <span className={cn(jsonViewerTheme.badge, jsonViewerTheme.required, 'ml-1.5')}>required</span>}
      {colon}
    </span>
  );
}

const quote = <span className="group-data-[openapi-mode=schema]/json-viewer:hidden">"</span>;

const baseClass = tw('wrap-break-word whitespace-pre-line');

interface InlinePrimitiveValueProps {
  value: unknown;
}

function InlinePrimitiveValue({ value }: InlinePrimitiveValueProps) {
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

function PrimitiveValue({ value, type, collapseStringsAfterLength, openapiMode }: PrimitiveValueProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  switch (type) {
    case 'string': {
      const str = String(value);

      // Schema-mode type keywords render unquoted and in the type color.
      if (openapiMode === 'schema' && jsonSchemaTypes.has(str)) return <span className={cn(baseClass, jsonViewerTheme.schemaType)}>{str}</span>;

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
      if (!shouldTruncate) return <span className={baseClass}>{text}</span>;

      const toggle = () => setIsExpanded((prev) => !prev);
      return (
        // biome-ignore lint/a11y/useSemanticElements: text inside a real button cannot be selected to copy, so the string stays a span.
        <span
          className={cn(baseClass, 'focus-effect cursor-pointer rounded')}
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

interface CollapsedPreviewProps {
  itemCount: number;
  closeBracket: string;
  hiddenMatchCount: number;
}

function CollapsedPreview({ itemCount, closeBracket, hiddenMatchCount }: CollapsedPreviewProps) {
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

interface CopyNodeButtonProps {
  value: unknown;
}

function CopyNodeButton({ value }: CopyNodeButtonProps) {
  const { t } = useTranslation();
  const { copied, copyToClipboard } = useCopyToClipboard(2000);

  const handleCopy = (event: MouseEvent) => {
    event.stopPropagation();
    copyToClipboard(JSON.stringify(value, null, 2));
  };

  return (
    // Absolute in the padding its row reserves: as a flex item it would wrap onto an empty line
    <button
      type="button"
      className="focus-effect hover:bg-hover absolute end-0.5 top-px inline-flex h-lh cursor-pointer items-center justify-center rounded px-0.5 opacity-0 transition-opacity group-hover/node:opacity-60 hover:opacity-100 focus-visible:opacity-100"
      onClick={handleCopy}
      aria-label={t('c:copy')}
      title={t('c:copy')}
    >
      <CopiedIcon copied={copied} icon={CopyIcon} />
    </button>
  );
}

// Adjacent spans leave no place to break, so each label of the row wraps as one flex item.
const labelRowClass = tw('flex flex-wrap items-baseline');

interface JsonNodeProps {
  value: unknown;
  path: JsonPath;
  keyName: string | number | false;
  depth: number;
  /** Does not increment for flattened nodes. */
  visualDepth?: number;
}

function JsonNodeBase({ value, path, keyName, depth, visualDepth }: JsonNodeProps) {
  const effectiveVisualDepth = visualDepth ?? depth;

  const context = useJsonViewerContext();
  const { defaultInspectDepth, enableClipboard, openapiMode, renderDescription } = context;

  // Flattened nodes render always expanded and without a key.
  const isPropertiesNode = openapiMode === 'schema' && keyName === 'properties';
  const isCompositionNode = openapiMode === 'schema' && (keyName === 'anyOf' || keyName === 'oneOf');
  const isFlattenedNode = isPropertiesNode || isCompositionNode;
  const isRootInSchemaMode = openapiMode === 'schema' && depth === 0;
  // 'items' nodes keep their header, so the array item structure stays visible.
  const hideExpandHeader = isFlattenedNode || isRootInSchemaMode;

  const { isExpanded, setIsExpanded, isCurrentMatch, rowRef, keyRef } = useNodeExpansion(path, hideExpandHeader || depth < defaultInspectDepth);

  const paddingLeft = effectiveVisualDepth * context.indentWidth * 8;
  const rowProps = { ref: rowRef, 'data-match-current': isCurrentMatch || undefined, style: { paddingLeft } };

  const valueType = getValueType(value);
  const keyProps = {
    keyName,
    showKeyQuotes: context.showKeyQuotes,
    isObjectValue: valueType === 'object',
    hasSelfRequired: openapiMode === 'schema' && isRecord(value) && value.required === true,
    openapiMode,
    ref: keyRef,
  };

  const customType = context.valueTypes.find((dataType) => dataType.is(value, path));
  if (customType) {
    return (
      <div {...rowProps} className={labelRowClass}>
        <NodeKey {...keyProps} />
        <customType.Component value={value} path={path} />
      </div>
    );
  }

  // Schema mode: a description reads as prose under its field, whole and without its key
  if (openapiMode === 'schema' && keyName !== false && isDescriptionKeyword(keyName, value)) {
    return (
      <div {...rowProps} className="max-w-measure text-foreground-soft py-0.5 font-sans">
        {renderDescription ? renderDescription(value) : value}
      </div>
    );
  }

  if (!isRecord(value) && !Array.isArray(value)) {
    return (
      <div {...rowProps} className="max-w-measure">
        <NodeKey {...keyProps} />
        <PrimitiveValue value={value} type={valueType} collapseStringsAfterLength={context.collapseStringsAfterLength} openapiMode={openapiMode} />
      </div>
    );
  }

  const { labels, entries, schemaPropertiesCount, isExpandable, isPrimitiveArray } = describeNode(
    value,
    openapiMode,
    isPropertiesNode,
    context.hideDescriptions,
  );
  const isArray = Array.isArray(value);
  const openBracket = isArray ? '[' : '{';
  const closeBracket = isArray ? ']' : '}';

  if (entries.length === 0) {
    return (
      <div {...rowProps} className={labelRowClass}>
        <NodeKey {...keyProps} />
        <span className={jsonViewerTheme.bracket}>{openBracket}</span>
        <SchemaLabels {...labels} />
        <span className={jsonViewerTheme.bracket}>{closeBracket}</span>
      </div>
    );
  }

  if (isArray && isPrimitiveArray) {
    return (
      <div {...rowProps} className="wrap-break-word">
        <NodeKey {...keyProps} />
        <span className={jsonViewerTheme.bracket}>[</span>
        {value.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rendering an inline primitive array; items have no stable id.
          <span key={index}>
            <InlinePrimitiveValue value={item} />
            {index < value.length - 1 && <span className="text-faint-foreground">, </span>}
          </span>
        ))}
        <span className={jsonViewerTheme.bracket}>]</span>
      </div>
    );
  }

  const hiddenMatchCount = isExpanded ? 0 : matchRowPaths(value, context.searchText).length;

  return (
    <div>
      {!hideExpandHeader && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: the whole row toggles for the mouse; the chevron button inside is the keyboard path.
        <div
          {...rowProps}
          className={
            isExpandable
              ? cn(
                  labelRowClass,
                  'group/node hover:bg-hover relative -mx-1 -my-px w-fit cursor-pointer gap-x-0.5 rounded py-px',
                  enableClipboard ? 'pe-6' : 'pr-1',
                )
              : labelRowClass
          }
          onClick={isExpandable ? () => setIsExpanded((prev) => !prev) : undefined}
        >
          {/* One unit: a long path key wraps beside its chevron, and the bracket stays behind it. */}
          <span className="flex min-w-0 items-baseline">
            {isExpandable && (
              // No handler of its own: its click bubbles to the row, so Enter and Space toggle the node as a mouse click does.
              <button
                type="button"
                aria-expanded={isExpanded}
                aria-label={i18n.t(isExpanded ? 'c:collapse' : 'c:expand')}
                className="focus-effect me-0.5 inline-flex h-lh w-4 shrink-0 cursor-pointer items-center justify-center self-start rounded opacity-60 focus-visible:opacity-100"
              >
                <ChevronRightIcon className={cn('size-3.5 transition-transform', isExpanded && 'rotate-90')} />
              </button>
            )}
            <span className="min-w-0">
              <NodeKey {...keyProps} />
              <span className={jsonViewerTheme.bracket}>{openBracket}</span>
            </span>
          </span>
          <SchemaLabels {...labels} />
          {!isExpanded && isExpandable && (
            <CollapsedPreview itemCount={schemaPropertiesCount} closeBracket={closeBracket} hiddenMatchCount={hiddenMatchCount} />
          )}
          {enableClipboard && isExpandable && <CopyNodeButton value={value} />}
        </div>
      )}
      {(isExpanded || hideExpandHeader || !isExpandable) && (
        <div>
          {entries.map(([key, child]) => (
            <JsonNode
              key={String(key)}
              value={child}
              path={[...path, key]}
              keyName={key}
              depth={depth + 1}
              visualDepth={hideExpandHeader ? effectiveVisualDepth : effectiveVisualDepth + 1}
            />
          ))}
          {!hideExpandHeader && (
            <div style={{ paddingLeft }}>
              <span className={jsonViewerTheme.bracket}>{closeBracket}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function jsonNodeEqual(prev: JsonNodeProps, next: JsonNodeProps) {
  if (prev.value !== next.value) return false;
  if (prev.keyName !== next.keyName) return false;
  if (prev.depth !== next.depth) return false;
  if (prev.visualDepth !== next.visualDepth) return false;
  // Compare path arrays by value so a new reference does not re-render.
  if (prev.path.length !== next.path.length) return false;
  for (let i = 0; i < prev.path.length; i++) {
    if (prev.path[i] !== next.path[i]) return false;
  }
  return true;
}

export const JsonNode = memo(JsonNodeBase, jsonNodeEqual);
