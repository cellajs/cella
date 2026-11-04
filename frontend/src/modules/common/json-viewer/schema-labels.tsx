import { useJsonViewerContext } from '~/modules/common/json-viewer/context';
import { jsonViewerTheme } from '~/modules/common/json-viewer/theme';
import { cn } from '~/utils/cn';

export interface SchemaConstraints {
  maxLength?: number;
  minLength?: number;
  maximum?: number;
  minimum?: number;
}

export interface SchemaLabelsProps {
  typeValue: string | string[] | null;
  /** The full `$ref`, such as '#/components/schemas/User'. */
  refValue: string | null;
  contentTypeValue?: string | null;
  hasAnyOf?: boolean;
  hasOneOf?: boolean;
  constraints?: SchemaConstraints | null;
}

export function SchemaLabels({ typeValue, refValue, contentTypeValue, hasAnyOf, hasOneOf, constraints }: SchemaLabelsProps) {
  const { renderRef } = useJsonViewerContext();
  if (!typeValue && !refValue && !contentTypeValue && !hasAnyOf && !hasOneOf && !constraints) return null;

  const typeValues = typeValue ? (Array.isArray(typeValue) ? typeValue : [typeValue]) : [];

  const compositionLabel = hasAnyOf ? 'anyOf' : hasOneOf ? 'oneOf' : null;

  return (
    <>
      {typeValues.length > 0 && (
        // One unit, so a union wraps whole
        <span>
          {typeValues.map((type, index) => (
            <span key={type}>
              <span className={cn(jsonViewerTheme.schemaType, 'ml-0.5 px-1 py-0.5 text-xs')}>{type}</span>
              {index < typeValues.length - 1 && <span className="text-muted-foreground mx-1">|</span>}
            </span>
          ))}
        </span>
      )}
      {compositionLabel && <span className={cn(jsonViewerTheme.badge, 'bg-muted text-code-type ml-0.5')}>{compositionLabel}</span>}
      {refValue && (
        <span className={cn(jsonViewerTheme.badge, 'bg-primary/10 text-primary ml-0.5')}>
          {renderRef ? renderRef(refValue) : refValue.split('/').pop()}
        </span>
      )}
      {contentTypeValue && <span className="text-muted-foreground ml-1 text-xs italic">{contentTypeValue}</span>}
      {constraints && (
        <span className="text-muted-foreground ml-1.5 text-xs">
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
