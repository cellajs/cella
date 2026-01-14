import { useSuspenseQuery } from '@tanstack/react-query';
import { HashUrlButton } from '~/modules/docs/hash-url-button';
import type { GenComponentSchema } from '~/modules/docs/types';
import { ViewerGroup } from '~/modules/docs/viewer-group';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import {
  getTypeCodeForSchema,
  getZodCodeForSchema,
  typesContentQueryOptions,
  zodContentQueryOptions,
} from './helpers/extract-types';

interface SchemaDetailProps {
  schema: GenComponentSchema;
}

/**
 * Single schema detail card with collapsible ViewerGroup.
 * Lazily loads types/zod content via React Query.
 */
export const SchemaDetail = ({ schema }: SchemaDetailProps) => {
  const { data: zodContent } = useSuspenseQuery(zodContentQueryOptions);
  const { data: typesContent } = useSuspenseQuery(typesContentQueryOptions);

  // Strip leading #
  const refId = schema.ref.replace(/^#/, '');

  return (
    <Card id={refId} className="scroll-mt-14 sm:scroll-mt-2 border-0">
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
