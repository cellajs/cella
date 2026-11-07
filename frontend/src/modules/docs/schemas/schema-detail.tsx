import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useRouter } from '@tanstack/react-router';
import i18n from 'i18next';
import type { GenComponentSchema } from 'sdk/docs-types';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { HashUrlButton } from '~/modules/common/hash-url-button';
import { getTypeCodeForSchema, getZodCodeForSchema } from '~/modules/docs/helpers/extract-types';
import { schemaAnchor, schemaLinkOptions } from '~/modules/docs/helpers/reference-links';
import { openDocsSheet } from '~/modules/docs/open-docs-sheet';
import { schemasQueryOptions, useDefinitionIndexes } from '~/modules/docs/query';
import { SpecText } from '~/modules/docs/spec-text';
import { ViewerGroup } from '~/modules/docs/viewer-group';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { cn } from '~/utils/cn';
import { isModifiedClick } from '~/utils/is-modified-click';

const openSchemaSheet = (schema: GenComponentSchema, trigger: HTMLAnchorElement) =>
  openDocsSheet({ id: `schema-${schema.name}`, title: i18n.t('c:schema'), trigger, content: <SchemaDetail schema={schema} /> });

interface SchemaLinkProps {
  schema: GenComponentSchema;
  className?: string;
}

/** A schema's name, linking to it on the schemas page. A plain click opens it in a sheet over the current page. */
export function SchemaLink({ schema, className }: SchemaLinkProps) {
  return (
    <Link
      {...schemaLinkOptions(schema)}
      className={cn('link-inline', className)}
      onClick={(event) => {
        // A viewer row around the link toggles on click
        event.stopPropagation();
        if (isModifiedClick(event)) return;
        event.preventDefault();
        openSchemaSheet(schema, event.currentTarget);
      }}
    >
      {schema.name}
    </Link>
  );
}

/** A viewer's `renderRef`: a `$ref` as a link to its schema, or its name when no schema has that ref. */
export function useSchemaRefLink() {
  const { data: schemas } = useSuspenseQuery(schemasQueryOptions);
  return (ref: string) => {
    const schema = schemas.find((entry) => entry.ref === ref);
    return schema ? <SchemaLink schema={schema} /> : ref.split('/').pop();
  };
}

interface SchemaDetailProps {
  schema: GenComponentSchema;
  /** Scroll-spy section id, set on the schemas page only. */
  id?: string;
  className?: string;
}

function SchemaDetail({ schema, id, className }: SchemaDetailProps) {
  const { zodIndex, typesIndex } = useDefinitionIndexes();
  const renderRef = useSchemaRefLink();
  const { href } = useRouter().buildLocation(schemaLinkOptions(schema));

  return (
    <Card id={id} className={cn('border-0', className)}>
      <CardHeader className="group/hash-url">
        <CardTitle level={3} className="gap-2 text-xl leading-8">
          {schema.name}
          <HashUrlButton hash={schemaAnchor(schema)} href={href} />
        </CardTitle>
        {schema.description && (
          <CardDescription className="max-w-measure my-2 text-base">
            <SpecText text={schema.description} />
          </CardDescription>
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
            renderRef={renderRef}
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
    <div>
      {schemas.map((schema) => (
        <SchemaDetail
          key={schema.name}
          schema={schema}
          id={`spy-${schemaAnchor(schema)}`}
          className="border-input rounded-none border-t border-dashed last:rounded-b-lg"
        />
      ))}
    </div>
  );
}
