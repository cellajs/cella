import type { FC } from 'react';

interface SchemaLabelsProps {
  typeValue: string | string[] | null;
  refValue: string | null;
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
 * Renders type and ref labels for OpenAPI schema mode.
 * Shows type label (e.g., "object", "string") and ref label (e.g., "User").
 */
export const SchemaLabels: FC<SchemaLabelsProps> = ({ typeValue, refValue, theme }) => {
  if (!typeValue && !refValue) return null;

  // Normalize typeValue to array for consistent rendering
  const typeValues = typeValue ? (Array.isArray(typeValue) ? typeValue : [typeValue]) : [];

  return (
    <>
      {typeValues.map((type, index) => (
        <span key={type}>
          <span
            className={`ml-1 px-1 py-0.5 text-sm font-medium rounded ${theme.schemaType} ${getTypeColorClass(type, theme)}`}
          >
            {type}
          </span>
          {index < typeValues.length - 1 && <span className="mx-1 opacity-50">|</span>}
        </span>
      ))}
      {refValue && (
        <span className="ml-1 px-1 py-0.5 text-sm font-medium rounded text-primary bg-primary/10">{refValue}</span>
      )}
    </>
  );
};
