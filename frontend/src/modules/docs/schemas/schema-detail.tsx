import { useSuspenseQuery } from '@tanstack/react-query';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { HashUrlButton } from '~/modules/common/hash-url-button';
import type { GenComponentSchema } from '~/modules/docs/types';
import { ViewerGroup } from '~/modules/docs/viewer-group';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { cn } from '~/utils/cn';
import { getHashUrl } from '../hash-url';
import {
  getTypeCodeForSchema,
  getZodCodeForSchema,
  typesIndexQueryOptions,
  zodIndexQueryOptions,
} from '../helpers/extract-types';

interface SchemaDetailProps {
  schema: GenComponentSchema;
  className?: string;
}

function SchemaDetail({ schema, className }: SchemaDetailProps) {
  const { data: zodIndex } = useSuspenseQuery(zodIndexQueryOptions);
  const { data: typesIndex } = useSuspenseQuery(typesIndexQueryOptions);

  const refId = schema.ref.replace(/^#/, '');

  return (
    <Card id={`spy-${refId}`} className={cn('border-0', className)}>
      <CardHeader className="group">
        <CardTitle className="gap-2 text-xl leading-8">
          {schema.name}
          <HashUrlButton url={getHashUrl(refId)} />
        </CardTitle>
        {schema.description && (
          <CardDescription className="my-2 max-w-4xl text-base">{schema.description}</CardDescription>
        )}
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
  const sectionIds = schemas.map((s) => s.ref.replace(/^#/, ''));
  useScrollSpy(sectionIds);

  return (
    <div className="border-t border-dashed">
      {schemas.map((schema) => (
        <SchemaDetail key={schema.name} schema={schema} className="rounded-none last:rounded-b-lg" />
      ))}
    </div>
  );
}
