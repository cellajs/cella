import type { GenComponentSchema } from 'sdk/docs-types';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { HashUrlButton } from '~/modules/common/hash-url-button';
import { getTypeCodeForSchema, getZodCodeForSchema } from '~/modules/docs/helpers/extract-types';
import { schemaAnchor } from '~/modules/docs/helpers/schema-anchor';
import { useDefinitionIndexes } from '~/modules/docs/query';
import { ViewerGroup } from '~/modules/docs/viewer-group';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { cn } from '~/utils/cn';

interface SchemaDetailProps {
  schema: GenComponentSchema;
  className?: string;
}

function SchemaDetail({ schema, className }: SchemaDetailProps) {
  const { zodIndex, typesIndex } = useDefinitionIndexes();

  const refId = schemaAnchor(schema);

  return (
    <Card id={`spy-${refId}`} className={cn('border-0', className)}>
      <CardHeader className="group/hash-url">
        <CardTitle level={3} className="gap-2 text-xl leading-8">
          {schema.name}
          <HashUrlButton hash={refId} />
        </CardTitle>
        {schema.description && <CardDescription className="my-2 max-w-4xl text-base">{schema.description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="mt-2">
          <ViewerGroup
            schema={schema.schema}
            zodCode={getZodCodeForSchema(zodIndex, schema.name)}
            typeCode={getTypeCodeForSchema(typesIndex, schema.name)}
            example={schema.example}
            defaultInspectDepth={3}
          />
        </div>
      </CardContent>
    </Card>
  );
}

interface TagSchemasListProps {
  schemas: GenComponentSchema[];
}

/** Registers all schema refs with the shared scroll spy in one hook call. */
export function TagSchemasList({ schemas }: TagSchemasListProps) {
  const sectionIds = schemas.map(schemaAnchor);
  useScrollSpy(sectionIds);

  return (
    <div className="border-t border-dashed">
      {schemas.map((schema) => (
        <SchemaDetail key={schema.name} schema={schema} className="rounded-none last:rounded-b-lg" />
      ))}
    </div>
  );
}
