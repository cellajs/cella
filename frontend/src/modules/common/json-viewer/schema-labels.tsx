import type { FC } from 'react';

interface SchemaLabelsProps {
  typeValue: string | null;
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

  return (
    <>
      {typeValue && (
        <span
          className={`ml-1 px-1 py-0.5 text-[10px] font-medium rounded ${theme.schemaType} ${getTypeColorClass(typeValue, theme)}`}
        >
          {typeValue}
        </span>
      )}
      {refValue && (
        <span className="ml-1 px-1 py-0.5 text-[10px] font-medium rounded text-primary bg-primary/10">{refValue}</span>
      )}
    </>
  );
};
