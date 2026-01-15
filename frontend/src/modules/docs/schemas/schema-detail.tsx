import { useSuspenseQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { HashUrlButton } from '~/modules/docs/hash-url-button';
import type { GenComponentSchema } from '~/modules/docs/types';
import { ViewerGroup } from '~/modules/docs/viewer-group';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { cn } from '~/utils/cn';
import {
  getTypeCodeForSchema,
  getZodCodeForSchema,
  typesContentQueryOptions,
  zodContentQueryOptions,
} from '../helpers/extract-types';

interface SchemaDetailProps {
  schema: GenComponentSchema;
  className?: string;
}

/**
 * Single schema detail card with collapsible ViewerGroup.
 * Lazily loads types/zod content via React Query.
 */
export const SchemaDetail = ({ schema, className }: SchemaDetailProps) => {
  const { data: zodContent } = useSuspenseQuery(zodContentQueryOptions);
  const { data: typesContent } = useSuspenseQuery(typesContentQueryOptions);

  // Strip leading #
  const refId = schema.ref.replace(/^#/, '');

  return (
    <Card id={refId} className={cn('border-0', className)}>
      <CardHeader className="group">
        <CardTitle className="text-xl leading-8 gap-2">
          {schema.name}
          <HashUrlButton id={refId} />
        </CardTitle>
        {schema.description && (
          <CardDescription className="my-2 text-base max-w-4xl">{schema.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="mt-2">
          <ViewerGroup
            schema={schema.schema}
            zodCode={getZodCodeForSchema(zodContent, schema.name)}
            typeCode={getTypeCodeForSchema(typesContent, schema.name)}
            example={schema.example}
            defaultInspectDepth={3}
          />
        </div>
      </CardContent>
    </Card>
  );
};

interface TagSchemasListProps {
  schemas: GenComponentSchema[];
}

/**
 * Renders a list of schema details and registers all schema refs
 * with the shared scroll spy in a single hook call.
 */
export const TagSchemasList = ({ schemas }: TagSchemasListProps) => {
  // Register all schema refs for this tag section
  const sectionIds = useMemo(() => schemas.map((s) => s.ref.replace(/^#/, '')), [schemas]);
  useScrollSpy({ sectionIds });

  return (
    <div className="border-t">
      {schemas.map((schema) => (
        <SchemaDetail key={schema.name} schema={schema} className="rounded-none last:rounded-b-lg" />
      ))}
    </div>
  );
};
