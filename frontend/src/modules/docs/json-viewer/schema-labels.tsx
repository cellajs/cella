import type { FC } from 'react';

interface SchemaLabelsProps {
  typeValue: string | string[] | null;
  refValue: string | null;
  contentTypeValue?: string | null;
  /** Whether this node contains anyOf composition */
  hasAnyOf?: boolean;
  /** Whether this node contains oneOf composition */
  hasOneOf?: boolean;
  theme: {
    string: string;
    number: string;
    boolean: string;
    null: string;
    schemaType: string;
  };
}

/** Returns the appropriate color class for a JSON Schema type keyword */
const getTypeColorClass = (
  typeValue: string,
  theme: { string: string; number: string; boolean: string; null: string },
): string => {
  switch (typeValue) {
    case 'string':
      return theme.string;
    case 'number':
    case 'integer':
      return theme.number;
    case 'boolean':
      return theme.boolean;
    case 'null':
      return theme.null;
    default:
      return 'text-purple-600 dark:text-purple-400'; // for array/object
  }
};

/**
 * Renders type, ref, and contentType labels for OpenAPI schema mode.
 * Shows type label (e.g., "object", "string"), ref label (e.g., "User"), and contentType (e.g., "application/json").
 * Also shows composition labels (anyOf, oneOf) when present.
 */
export const SchemaLabels: FC<SchemaLabelsProps> = ({
  typeValue,
  refValue,
  contentTypeValue,
  hasAnyOf,
  hasOneOf,
  theme,
}) => {
  if (!typeValue && !refValue && !contentTypeValue && !hasAnyOf && !hasOneOf) return null;

  // Normalize typeValue to array for consistent rendering
  const typeValues = typeValue ? (Array.isArray(typeValue) ? typeValue : [typeValue]) : [];

  // Composition label (anyOf takes precedence over oneOf if both are present)
  const compositionLabel = hasAnyOf ? 'anyOf' : hasOneOf ? 'oneOf' : null;

  return (
    <>
      {typeValues.map((type, index) => (
        <span key={type}>
          <span
            className={`ml-0.5 px-1 py-0.5 text-xs font-medium rounded opacity-70 ${theme.schemaType} ${getTypeColorClass(type, theme)}`}
          >
            {type}
          </span>
          {index < typeValues.length - 1 && <span className="mx-1 opacity-50">|</span>}
        </span>
      ))}
      {compositionLabel && (
        <span className="ml-0.5 px-1 py-0.5 text-xs font-medium rounded text-amber-600 dark:text-amber-400 bg-amber-500/10">
          {compositionLabel}
        </span>
      )}
      {refValue && (
        <span className="ml-0.5 px-1 py-0.5 text-xs font-medium rounded text-primary bg-primary/10">{refValue}</span>
      )}
      {contentTypeValue && <span className="ml-1 italic text-xs text-foreground/40">{contentTypeValue}</span>}
    </>
  );
};
