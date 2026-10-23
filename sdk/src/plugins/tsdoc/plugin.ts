import { config } from 'shared/config/config.default';
import { generateOperationHash } from '../../openapi-parser/operation-hash';
import type { OpenApiSpec, OpenApiTag } from '../../openapi-parser/types';
import type { TsdocPlugin } from './types';

/** The query and hash format must stay aligned with the frontend docs route and `generateOperationHash`. */
export function buildOperationDocsUrl(method: string, path: string, tag: string): string {
  return `${config.frontendUrl}/docs/operations?operationTag=${tag}#${generateOperationHash(method, path, [tag])}`;
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
      ...extractParamTags('body', operation.body?.schema?.properties),
    ];

    const tsdocEnhancements = [`**${method} ${path}**${docsLink} ·· _${tags.join(' · ')}_`, '', `@param {${operation.id}Data} options`, ...paramTags];

    const returnCodes = extractResponseCodes(operation.responses ?? {});
    if (returnCodes) {
      tsdocEnhancements.push(returnCodes);
    }

    operation.description = [operation.description ?? '', '', ...tsdocEnhancements].join('\n');
  });
};

/**
 * Formats the operation's status codes into a single `@returns` TSDoc line.
 *
 * biome-ignore lint/suspicious/noExplicitAny: allows flexibility in schema definitions
 */
function extractResponseCodes(responses: Record<string, any>): string | undefined {
  const codes = Object.keys(responses);
  if (codes.length === 0) {
    return;
  }

  return `@returns Possible status codes: ${codes.join(', ')}`;
}

/**
 * Generates TSDoc `@param` tags for one request section. Path and query parameters carry their schema under `schema`; body properties are schemas themselves.
 *
 * biome-ignore lint/suspicious/noExplicitAny: allows flexibility in schema definitions
 */
function extractParamTags(location: 'path' | 'query' | 'body', entries: Record<string, any> = {}): string[] {
  return Object.entries(entries).map(([key, entry]) => {
    // Path and query parameters are keyed in lower case; the parameter keeps its own name.
    const name = location === 'body' ? key : (entry.name ?? key);
    const required = entry.required ?? false;
    const type = getSchemaType(location === 'body' ? entry : entry.schema);
    const optional = required ? '' : '=';

    return `@param {${type}${optional}} options.${location}.${name} - \`${type}\` ${required ? '' : '(optional)'}`.trim();
  });
}

/**
 * Resolves a stringified type covering primitives, arrays, and logical `or` combinations.
 *
 * biome-ignore lint/suspicious/noExplicitAny: allows flexibility in schema definitions
 */
function getSchemaType(schema: any): string {
  if (!schema) return 'any';

  if (schema.type) {
    if (schema.type === 'array' && schema.items) {
      return `${getSchemaType(schema.items)}[]`;
    }
    return schema.type;
  }

  if (schema.items && Array.isArray(schema.items) && schema.logicalOperator === 'or') {
    const types = schema.items.flat().map(getSchemaType);
    return types.join(' | ');
  }

  return 'any';
}
