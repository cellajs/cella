import { config } from '../../../../shared/config/config.default';
import { generateOperationHash } from '../openapi-parser/file-generators';
import type { TsdocPlugin } from './types';

/**
 * Build a deep link to the frontend docs for a single operation/tag.
 *
 * The format must stay in sync with the docs operations route, which reads the
 * `operationTag` search param to expand the tag and uses {@link generateOperationHash}
 * for the anchor fragment.
 *
 * @example
 * buildOperationDocsUrl('post', '/auth/check-email', 'auth')
 * // https://www.cellajs.com/docs/operations?operationTag=auth#tag/auth/POST/auth/check-email
 */
export function buildOperationDocsUrl(method: string, path: string, tag: string): string {
  return `${config.frontendUrl}/docs/operations?operationTag=${tag}#${generateOperationHash(method, path, [tag])}`;
}

/**
 * Handler function for the `tsdoc` plugin.
 *
 * Enriches each generated operation's description with a TSDoc-style summary: a
 * method/path heading, links to the hosted docs, and `@param`/`@returns` tags derived
 * from the operation's path, query, and body parameters and its response codes.
 *
 * @param plugin - The TSDoc Plugin instance
 */
export const handler: TsdocPlugin['Handler'] = ({ plugin }) => {
  plugin.forEach('operation', (op) => {
    const operation = op.operation;

    const method = operation.method.toUpperCase();
    const path = operation.path;
    const tags = operation.tags ?? [];
    const allParams = operation.parameters ?? {};
    const requestBody = operation.body;
    const responses = operation.responses ?? {};

    // Collect all @param tags from path/query/body parameters
    const paramTags = [
      ...extractParamTags('path', allParams.path),
      ...extractParamTags('query', allParams.query),
      ...extractBodyParamTags(requestBody?.schema?.properties ?? {}),
    ];

    // Generate @see links to docs
    const seeTags = tags.map((tag) => `[${operation.id}](${buildOperationDocsUrl(operation.method, path, tag)})`);

    // Compose TSDoc enhancements
    const tsdocEnhancements = [
      `**${method} ${path}** ·· ${seeTags.join(' ·· ')} ·· _${tags.join('_')}_`,
      '',
      `@param {${operation.id}Data} options`,
      ...paramTags,
    ];

    // Add @returns tag for response codes
    const returnCodes = extractResponseCodes(responses);
    if (returnCodes) {
      tsdocEnhancements.push(returnCodes);
    }

    // Merge original description with generated TSDoc
    operation.description = [operation.description ?? '', '', ...tsdocEnhancements].join('\n');
  });
};

/**
 * Extracts HTTP status codes from an OpenAPI operation's `responses` object
 * and formats them into a single `@returns` TSDoc line.
 *
 * @param responses - The operation’s responses object, keyed by status code
 * @returns A `@returns` string listing possible status codes, or `undefined` if none exist
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
 * Generates TSDoc `@param` tags for path or query parameters from an OpenAPI spec.
 *
 * @param location - Either `"path"` or `"query"` to specify parameter source
 * @param parameters - The parameter definitions from the OpenAPI operation
 * @returns An array of formatted TSDoc `@param` strings
 *
 * biome-ignore lint/suspicious/noExplicitAny: allows flexibility in schema definitions
 */
function extractParamTags(location: 'path' | 'query', parameters: Record<string, any> = {}): string[] {
  return Object.entries(parameters).map(([name, param]) => {
    const required = param.required ?? false;
    const type = getSchemaType(param.schema);
    const optional = required ? '' : '=';

    return `@param {${type}${optional}} options.${location}.${name} - \`${type}\` ${required ? '' : '(optional)'}`.trim();
  });
}

/**
 * Generates TSDoc `@param` tags for body properties in a request.
 *
 * @param properties - The properties of the request body schema
 * @returns An array of formatted TSDoc `@param` strings for body fields
 *
 * biome-ignore lint/suspicious/noExplicitAny: allows flexibility in schema definitions
 */
function extractBodyParamTags(properties: Record<string, any>): string[] {
  return Object.entries(properties).map(([name, prop]) => {
    const required = prop.required ?? false;
    const type = getSchemaType(prop);
    const optional = required ? '' : '=';

    return `@param {${type}${optional}} options.body.${name} - \`${type}\` ${required ? '' : '(optional)'}`.trim();
  });
}

/**
 * Resolves a stringified type from a given OpenAPI schema definition.
 * Handles primitives, arrays, and logical `or` combinations.
 *
 * @param schema - The schema object to resolve
 * @returns A string representing the resolved TypeScript-compatible type
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
