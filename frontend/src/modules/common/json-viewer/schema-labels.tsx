import { getTypeColorClass, jsonViewerTheme } from '~/modules/common/json-viewer/theme';
import { cn } from '~/utils/cn';

export interface SchemaConstraints {
  maxLength?: number;
  minLength?: number;
  maximum?: number;
  minimum?: number;
}

interface SchemaLabelsProps {
  typeValue: string | string[] | null;
  refValue: string | null;
  contentTypeValue?: string | null;
  hasAnyOf?: boolean;
  hasOneOf?: boolean;
  constraints?: SchemaConstraints | null;
}

export function SchemaLabels({ typeValue, refValue, contentTypeValue, hasAnyOf, hasOneOf, constraints }: SchemaLabelsProps) {
  if (!typeValue && !refValue && !contentTypeValue && !hasAnyOf && !hasOneOf && !constraints) return null;

  const typeValues = typeValue ? (Array.isArray(typeValue) ? typeValue : [typeValue]) : [];

  // anyOf takes precedence over oneOf when both are present.
  const compositionLabel = hasAnyOf ? 'anyOf' : hasOneOf ? 'oneOf' : null;

  return (
    <>
      {typeValues.map((type, index) => (
        <span key={type}>
          <span className={cn('ml-0.5 rounded px-1 py-0.5 font-medium text-xs opacity-70', jsonViewerTheme.schemaType, getTypeColorClass(type))}>
            {type}
          </span>
          {index < typeValues.length - 1 && <span className="mx-1 text-muted-foreground">|</span>}
        </span>
      ))}
      {compositionLabel && (
        <span className="ml-0.5 rounded bg-amber-500/10 px-1 py-0.5 font-medium text-amber-600 text-xs dark:text-amber-400">{compositionLabel}</span>
      )}
      {refValue && <span className="ml-0.5 rounded bg-primary/10 px-1 py-0.5 font-medium text-primary text-xs">{refValue}</span>}
      {contentTypeValue && <span className="ml-1 text-muted-foreground text-xs italic">{contentTypeValue}</span>}
      {constraints && (
        <span className="ml-1.5 text-muted-foreground text-xs">
          {[
            constraints.minLength != null && `min:${constraints.minLength}`,
            constraints.maxLength != null && `max:${constraints.maxLength}`,
            constraints.minimum != null && `≥${constraints.minimum}`,
            constraints.maximum != null && `≤${constraints.maximum}`,
          ]
            .filter(Boolean)
            .join(' ')}
        </span>
      )}
    </>
  );
}
