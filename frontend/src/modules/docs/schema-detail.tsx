import type { GenComponentSchema } from '~/api.gen/docs';
import { HashUrlButton } from '~/modules/docs/hash-url-button';
import { ViewerGroup } from '~/modules/docs/viewer-group';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { getTypeCodeForSchema, getZodCodeForSchema } from './helpers/extract-types';

interface SchemaDetailProps {
  schema: GenComponentSchema;
}

/**
 * Single schema detail card with collapsible ViewerGroup
 */
export const SchemaDetail = ({ schema }: SchemaDetailProps) => {
  // Strip leading #
  const refId = schema.ref.replace(/^#/, '');

  return (
    <Card id={refId} className="scroll-mt-10 sm:scroll-mt-2 border-0">
      <CardHeader className="group">
        <CardTitle className="text-xl leading-8 gap-2">
          {schema.name}
          <HashUrlButton id={refId} />
        </CardTitle>
        {schema.description && <CardDescription className="my-2">{schema.description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="mt-2">
          <ViewerGroup
            schema={schema.schema}
            zodCode={getZodCodeForSchema(schema.name)}
            typeCode={getTypeCodeForSchema(schema.name)}
            defaultInspectDepth={3}
          />
        </div>
      </CardContent>
    </Card>
  );
};
