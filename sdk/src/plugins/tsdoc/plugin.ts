import type { IR } from '@hey-api/openapi-ts';
import { config } from 'shared/config/config.default';
import { generateOperationHash } from '../../openapi-parser/operation-hash';
import type { OpenApiSpec, OpenApiTag } from '../../openapi-parser/types';
import type { TsdocPlugin } from './types';

/** The query and hash format must stay aligned with the frontend docs route and `generateOperationHash`. */
export function buildOperationDocsUrl(method: string, path: string, tag: string): string {
  return `${config.origin}/docs/operations?operationTag=${tag}#${generateOperationHash(method, path, [tag])}`;
}

/** Extends each generated operation description with a method/path heading, a hosted-docs link, and tags derived from its parameters and response codes. */
export const handler: TsdocPlugin['Handler'] = ({ plugin }) => {
  const specTags = ((plugin.context.spec as OpenApiSpec).tags ?? []) as OpenApiTag[];
  const tagKinds = new Map(specTags.map((tag) => [tag.name, tag['x-kind']] as const));

  plugin.forEach('operation', (op) => {
    const operation = op.operation;

    const method = operation.method.toUpperCase();
    const path = operation.path;
    const tags = operation.tags ?? [];
    const parameters = operation.parameters ?? {};

    // The docs list an operation under its module tag only (a tag without a kind counts as one), and leave out an operation with a hidden tag.
    const isHidden = tags.some((tag) => tagKinds.get(tag) === 'hidden');
    const docsTag = isHidden ? undefined : tags.find((tag) => (tagKinds.get(tag) ?? 'module') === 'module');
    const docsLink = docsTag ? ` ·· [${operation.id}](${buildOperationDocsUrl(operation.method, path, docsTag)})` : '';

    const paramTags = [
      ...extractParamTags('path', parameters.path),
      ...extractParamTags('query', parameters.query),
      ...extractBodyTags(operation.body?.schema),
    ];

    const tsdocEnhancements = [`**${method} ${path}**${docsLink} ·· _${tags.join(' · ')}_`, '', `@param {${operation.id}Data} options`, ...paramTags];

    const returnCodes = extractResponseCodes(operation.responses ?? {});
    if (returnCodes) {
      tsdocEnhancements.push(returnCodes);
    }

    operation.description = [operation.description ?? '', '', ...tsdocEnhancements].join('\n');
  });
};

/** Formats the operation's status codes into a single `@returns` TSDoc line. */
function extractResponseCodes(responses: IR.ResponsesObject): string | undefined {
  const codes = Object.keys(responses);
  if (codes.length === 0) {
    return;
  }

  return `@returns Possible status codes: ${codes.join(', ')}`;
}

/** Generates TSDoc `@param` tags for the path or query parameters, each carrying its schema and required flag. */
function extractParamTags(location: 'path' | 'query', parameters: Record<string, IR.ParameterObject> = {}): string[] {
  // Parameters are keyed in lower case; the parameter keeps its own name.
  return Object.values(parameters).map((parameter) => paramTag(location, parameter.name, parameter.schema, parameter.required ?? false));
}

/** Generates TSDoc `@param` tags for the body's properties: a property is required when the body's `required` list names it. */
function extractBodyTags(schema?: IR.SchemaObject): string[] {
  const required = new Set(schema?.required ?? []);
  return Object.entries(schema?.properties ?? {}).map(([name, property]) => paramTag('body', name, property, required.has(name)));
}

function paramTag(location: 'path' | 'query' | 'body', name: string, schema: IR.SchemaObject, required: boolean): string {
  const type = getSchemaType(schema);
  const optional = required ? '' : '=';

  return `@param {${type}${optional}} options.${location}.${name} - \`${type}\` ${required ? '' : '(optional)'}`.trim();
}

/** Resolves a stringified type covering primitives, arrays, logical `or` combinations and component references. */
function getSchemaType(schema: IR.SchemaObject): string {
  // A component reference prints the component's name, which is also its generated type's.
  if (schema.$ref) return schema.$ref.slice(schema.$ref.lastIndexOf('/') + 1);

  if (schema.type) {
    if (schema.type === 'array' && schema.items) {
      // An array lists its item schemas; more than one is a union of them.
      const item = schema.items.map(getSchemaType).join(' | ');
      return item.includes(' | ') ? `(${item})[]` : `${item}[]`;
    }
    return schema.type;
  }

  if (schema.items && schema.logicalOperator === 'or') {
    return schema.items.map(getSchemaType).join(' | ');
  }

  return 'any';
}
