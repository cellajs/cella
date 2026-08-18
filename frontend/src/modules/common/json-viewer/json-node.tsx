import { ChevronRightIcon } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { CollapsedPreview } from './collapsed-preview';
import { useJsonViewerContext } from './context';
import { CopyButton } from './copy-button';
import { KeyRenderer } from './key-renderer';
import { InlinePrimitiveValue, PrimitiveValue } from './primitive-value';
import { SchemaLabels } from './schema-labels';
import type { Path } from './types';
import { countSearchMatchesInValue, getTypeLabel, getValueType } from './utils';

interface JsonNodeProps {
  value: unknown;
  path: Path;
  keyName?: string | number | false;
  depth: number;
  /** Visual depth for indentation; does not increment for flattened nodes */
  visualDepth?: number;
  /** How many more levels to auto-expand, passed down when a parent expands */
  cascadeDepth?: number;
}

export const JsonNode = memo(
  function JsonNode({ value, path, keyName, depth, visualDepth, cascadeDepth = 0 }: JsonNodeProps) {
    const effectiveVisualDepth = visualDepth ?? depth;

    const {
      theme,
      indentWidth,
      defaultInspectDepth,
      displayDataTypes,
      enableClipboard,
      valueTypes,
      collapseStringsAfterLength,
      targetPath,
      searchMatchPath,
      searchText,
      expandAll,
      showKeyQuotes,
      expandChildrenDepth,
      openapiMode,
    } = useJsonViewerContext();

    const singleLineArrays = openapiMode === 'schema';

    const [childCascadeDepth, setChildCascadeDepth] = useState(0);

    // Flattened nodes render always expanded and without a key.
    const isPropertiesNode = openapiMode === 'schema' && keyName === 'properties';
    const isCompositionNode = openapiMode === 'schema' && (keyName === 'anyOf' || keyName === 'oneOf');
    const isFlattenedNode = isPropertiesNode || isCompositionNode;

    const isRootInSchemaMode = openapiMode === 'schema' && depth === 0;

    const getDefaultExpanded = () => {
      if (isFlattenedNode || isRootInSchemaMode) return true;
      if (cascadeDepth > 0) return true;
      if (expandAll) return true;
      return depth < defaultInspectDepth;
    };

    const [isExpanded, setIsExpanded] = useState(getDefaultExpanded);

    // targetPath is set by $ref navigation.
    const isOnTargetPath = (() => {
      if (!targetPath || targetPath.length === 0) return false;
      if (path.length > targetPath.length) return false;
      return path.every((p, i) => String(p) === targetPath[i]);
    })();

    const isOnSearchMatchPath = (() => {
      if (!searchMatchPath || searchMatchPath.length === 0) return false;
      if (path.length > searchMatchPath.length) return false;
      return path.every((p, i) => String(p) === String(searchMatchPath[i]));
    })();

    useEffect(() => {
      if (expandAll && !isExpanded) {
        setIsExpanded(true);
      }
    }, [expandAll]);

    // Expanding along the target path leaves other nodes untouched.
    useEffect(() => {
      if (isOnTargetPath && !isExpanded) {
        setIsExpanded(true);
      }
    }, [isOnTargetPath, targetPath]);

    useEffect(() => {
      if (isOnSearchMatchPath && !isExpanded) {
        setIsExpanded(true);
      }
    }, [isOnSearchMatchPath, searchMatchPath]);

    const paddingLeft = effectiveVisualDepth * indentWidth * 8;

    for (const dataType of valueTypes) {
      if (dataType.is(value, path)) {
        const CustomComponent = dataType.Component;
        return (
          <div className="whitespace-nowrap" style={{ paddingLeft }}>
            {keyName !== false &&
              (typeof keyName === 'number' ? (
                <span className={theme.index}>{keyName}</span>
              ) : (
                <span className={`font-medium ${theme.key}`}>{showKeyQuotes ? `"${keyName}"` : keyName}</span>
              ))}
            {keyName !== false && <span className="mr-1 opacity-70">:</span>}
            <CustomComponent value={value} path={path} />
          </div>
        );
      }
    }

    const valueType = getValueType(value);

    const isObjectValue = valueType === 'object';

    const hasSelfRequired =
      openapiMode === 'schema' &&
      typeof value === 'object' &&
      value !== null &&
      (value as Record<string, unknown>).required === true;

    const keyProps = {
      keyName,
      showKeyQuotes,
      searchText,
      isObjectValue,
      hasSelfRequired,
      openapiMode,
      theme,
    };

    if (valueType !== 'object' && valueType !== 'array') {
      return (
        <div className="whitespace-nowrap" style={{ paddingLeft }}>
          <KeyRenderer {...keyProps} />
          {keyName !== false && <span className="mr-1 opacity-70">:</span>}
          <PrimitiveValue
            value={value}
            type={valueType}
            theme={theme}
            collapseStringsAfterLength={collapseStringsAfterLength}
            searchText={searchText}
            openapiMode={openapiMode}
          />
          {displayDataTypes && <span className="ml-2 text-sm opacity-50">{getTypeLabel(value, valueType)}</span>}
        </div>
      );
    }

    const isArray = valueType === 'array';

    // Entries inside 'properties' keep their type keys unfiltered.
    const parentKey = path.length > 0 ? path[path.length - 1] : null;
    const isInsideProperties = parentKey === 'properties';

    // 'type' renders as a label: a string, or an array such as ["string", "null"] for nullable.
    const typeValue = (() => {
      if (!openapiMode || openapiMode !== 'schema' || isArray || isInsideProperties) return null;
      if (typeof value !== 'object' || value === null) return null;
      const typeField = (value as Record<string, unknown>).type;
      if (typeof typeField === 'string') return typeField;
      if (Array.isArray(typeField) && typeField.every((t) => typeof t === 'string')) {
        return typeField as string[];
      }
      return null;
    })();

    const canExtractLabels =
      openapiMode === 'schema' && !isArray && !isInsideProperties && typeof value === 'object' && value !== null;
    const valueObj = canExtractLabels ? (value as Record<string, unknown>) : null;

    // anyOf/oneOf render as a type label.
    const hasAnyOf = valueObj ? Array.isArray(valueObj.anyOf) : false;
    const hasOneOf = valueObj ? Array.isArray(valueObj.oneOf) : false;

    // 'ref' renders as a label holding only the schema name: '#/components/schemas/User' becomes 'User'.
    const refValue = (() => {
      if (valueObj && typeof valueObj.ref === 'string') {
        return valueObj.ref.split('/').pop() || valueObj.ref;
      }
      return null;
    })();

    // Rendered as a label and filtered out of the entries below.
    const contentTypeValue =
      openapiMode === 'schema' && !isInsideProperties && valueObj && typeof valueObj.contentType === 'string'
        ? valueObj.contentType
        : null;

    // Rendered inline and filtered out of the entries below.
    const constraints = (() => {
      if (openapiMode !== 'schema' || isArray || typeof value !== 'object' || value === null) return null;
      const obj = value as Record<string, unknown>;
      const c: { maxLength?: number; minLength?: number; maximum?: number; minimum?: number } = {};
      if (typeof obj.maxLength === 'number') c.maxLength = obj.maxLength;
      if (typeof obj.minLength === 'number') c.minLength = obj.minLength;
      if (typeof obj.maximum === 'number') c.maximum = obj.maximum;
      if (typeof obj.minimum === 'number') c.minimum = obj.minimum;
      return Object.keys(c).length > 0 ? c : null;
    })();

    // Rendered as a synthetic [key] entry.
    const additionalPropsSchema = (() => {
      if (openapiMode !== 'schema' || isArray || isInsideProperties) return null;
      if (typeof value !== 'object' || value === null) return null;
      const ap = (value as Record<string, unknown>).additionalProperties;
      return ap && typeof ap === 'object' ? ap : null;
    })();

    // Array schemas hoist items.properties.
    const isArraySchema =
      openapiMode === 'schema' &&
      !isArray &&
      typeof value === 'object' &&
      value !== null &&
      (value as Record<string, unknown>).type === 'array';

    const rawEntries = isArray
      ? (value as unknown[]).map((v, i) => [i, v] as [number, unknown])
      : Object.entries(value as Record<string, unknown>);

    // Hide schema keys promoted into labels and hoist array-item properties.
    const filteredEntries =
      openapiMode === 'schema' && !isArray
        ? rawEntries.filter(
            ([key]) =>
              key !== 'required' &&
              key !== 'maxLength' &&
              key !== 'minLength' &&
              key !== 'maximum' &&
              key !== 'minimum' &&
              (isInsideProperties ||
                (key !== 'type' && key !== 'ref' && key !== 'contentType' && key !== 'additionalProperties')) &&
              !(isArraySchema && key === 'items'),
          )
        : rawEntries;

    const hoistedItemsEntries = (() => {
      if (!isArraySchema) return [];
      const items = (value as Record<string, unknown>).items;
      if (typeof items === 'object' && items !== null) {
        const itemProps = (items as Record<string, unknown>).properties;
        if (typeof itemProps === 'object' && itemProps !== null) {
          return Object.entries(itemProps);
        }
      }
      return [];
    })();

    const combinedEntries = [...filteredEntries, ...hoistedItemsEntries];

    // Primitives sort before objects and arrays.
    const entries =
      openapiMode === 'schema' && !isArray
        ? [...combinedEntries].sort(([, a], [, b]) => {
            const aIsObject = a !== null && typeof a === 'object';
            const bIsObject = b !== null && typeof b === 'object';
            if (aIsObject === bIsObject) return 0;
            return aIsObject ? 1 : -1;
          })
        : filteredEntries;

    if (additionalPropsSchema) {
      entries.push(['[key]', additionalPropsSchema] as [string, unknown]);
    }

    // Counts the children a reader actually sees.
    const schemaPropertiesCount = (() => {
      if (openapiMode !== 'schema' || isArray) return entries.length;
      const obj = value as Record<string, unknown>;
      if (isArraySchema) return hoistedItemsEntries.length;
      if (obj.properties && typeof obj.properties === 'object') return Object.keys(obj.properties).length;
      return entries.length;
    })();

    const openBracket = isArray ? '[' : '{';
    const closeBracket = isArray ? ']' : '}';
    const isEmpty = entries.length === 0;

    // Schema mode: an object is expandable only if it has nested object (not array) children; arrays are always expandable.
    const hasNestedObjects =
      openapiMode === 'schema' && !isArray
        ? entries.some(([, val]) => val !== null && typeof val === 'object' && !Array.isArray(val))
        : true;

    const bracketClass = `font-medium ${theme.bracket} group-data-[openapi-mode=schema]/jv:hidden`;

    if (isEmpty) {
      return (
        <div className="whitespace-nowrap" style={{ paddingLeft }}>
          <KeyRenderer {...keyProps} />
          {keyName !== false && <span className="mr-1 opacity-70">:</span>}
          <span className={bracketClass}>{openBracket}</span>
          <SchemaLabels
            typeValue={typeValue}
            refValue={refValue}
            contentTypeValue={contentTypeValue}
            hasAnyOf={hasAnyOf}
            hasOneOf={hasOneOf}
            constraints={constraints}
            theme={theme}
          />
          <span className={bracketClass}>{closeBracket}</span>
        </div>
      );
    }

    const isPrimitiveArray =
      isArray &&
      singleLineArrays &&
      (value as unknown[]).every((item) => item === null || (typeof item !== 'object' && typeof item !== 'undefined'));

    if (isPrimitiveArray) {
      const items = value as unknown[];
      return (
        <div className="whitespace-nowrap" style={{ paddingLeft }}>
          <KeyRenderer {...keyProps} />
          {keyName !== false && <span className="mr-1 opacity-70">:</span>}
          <span className={bracketClass}>[</span>
          {items.map((item, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rendering an inline primitive array; items have no stable id.
            <span key={index}>
              <InlinePrimitiveValue value={item} theme={theme} searchText={searchText} />
              {index < items.length - 1 && <span className="opacity-70">, </span>}
            </span>
          ))}
          <span className={bracketClass}>]</span>
        </div>
      );
    }

    const hiddenMatchCount = !isExpanded && searchText ? countSearchMatchesInValue(value, searchText) : 0;

    const isExpandable = hasNestedObjects;

    // Items nodes keep their header so the array item structure stays visible.
    const hideExpandHeader = isFlattenedNode || isRootInSchemaMode;

    return (
      <div data-properties-node={isFlattenedNode || undefined}>
        {!hideExpandHeader && (
          // biome-ignore lint/a11y/useKeyWithClickEvents: developer-facing JSON tree viewer; expand/collapse is a visual affordance for mouse users.
          <div
            className={`group/node -mx-1 -my-px inline-flex items-center gap-0.5 rounded px-1 py-px ${isExpandable ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-white/5' : 'pointer-events-none'}`}
            style={{ paddingLeft }}
            onClick={
              isExpandable
                ? () => {
                    if (!isExpanded && expandChildrenDepth > 1) {
                      setChildCascadeDepth(expandChildrenDepth - 1);
                    } else {
                      setChildCascadeDepth(0);
                    }
                    setIsExpanded(!isExpanded);
                  }
                : undefined
            }
          >
            <span
              className={`inline-flex h-4 w-4 shrink-0 items-center justify-center ${isExpandable ? 'opacity-60' : '-ml-3.5 opacity-0'}`}
            >
              <ChevronRightIcon className={`icon-sm transition-transform ${isExpanded ? 'rotate-90' : 'rotate-0'}`} />
            </span>
            <KeyRenderer {...keyProps} />
            {keyName !== false && <span className="mr-1 opacity-70">:</span>}
            <span className={bracketClass}>{openBracket}</span>
            <SchemaLabels
              typeValue={typeValue}
              refValue={refValue}
              contentTypeValue={contentTypeValue}
              hasAnyOf={hasAnyOf}
              hasOneOf={hasOneOf}
              constraints={constraints}
              theme={theme}
            />
            {!isExpanded && isExpandable && (
              <CollapsedPreview
                itemCount={schemaPropertiesCount}
                closeBracket={closeBracket}
                hiddenMatchCount={hiddenMatchCount}
                displayDataTypes={displayDataTypes}
                typeLabel={getTypeLabel(value, valueType)}
                theme={theme}
              />
            )}
            {enableClipboard && <CopyButton value={value} />}
          </div>
        )}
        {(isExpanded || hideExpandHeader || !isExpandable) && (
          <div>
            {entries.map(([key, val]) => (
              <JsonNode
                key={String(key)}
                value={val}
                path={[...path, key]}
                keyName={key}
                depth={depth + 1}
                visualDepth={hideExpandHeader ? effectiveVisualDepth : effectiveVisualDepth + 1}
                cascadeDepth={childCascadeDepth > 0 ? childCascadeDepth - 1 : cascadeDepth > 0 ? cascadeDepth - 1 : 0}
              />
            ))}
            {!hideExpandHeader && (
              <div style={{ paddingLeft }}>
                <span className={bracketClass}>{closeBracket}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
  (prev, next) => {
    if (prev.value !== next.value) return false;
    if (prev.keyName !== next.keyName) return false;
    if (prev.depth !== next.depth) return false;
    if (prev.visualDepth !== next.visualDepth) return false;
    if (prev.cascadeDepth !== next.cascadeDepth) return false;
    // Compare path arrays by value so a new reference does not re-render.
    if (prev.path.length !== next.path.length) return false;
    for (let i = 0; i < prev.path.length; i++) {
      if (prev.path[i] !== next.path[i]) return false;
    }
    return true;
  },
);
