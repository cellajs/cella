import { config } from '../../../../shared/config/config.default';
import { generateOperationHash } from '../openapi-parser/file-generators';
import type { TsdocPlugin } from './types';

/** The query and hash format must stay aligned with the frontend docs route and `generateOperationHash`. */
export function buildOperationDocsUrl(method: string, path: string, tag: string): string {
  return `${config.frontendUrl}/docs/operations?operationTag=${tag}#${generateOperationHash(method, path, [tag])}`;
}

/** Extends each generated operation description with a method/path heading, hosted-docs links, and tags derived from its parameters and response codes. */
export const handler: TsdocPlugin['Handler'] = ({ plugin }) => {
  plugin.forEach('operation', (op) => {
    const operation = op.operation;

    const method = operation.method.toUpperCase();
    const path = operation.path;
    const tags = operation.tags ?? [];
    const allParams = operation.parameters ?? {};
    const requestBody = operation.body;
    const responses = operation.responses ?? {};

    const paramTags = [
      ...extractParamTags('path', allParams.path),
      ...extractParamTags('query', allParams.query),
      ...extractBodyParamTags(requestBody?.schema?.properties ?? {}),
    ];

    const seeTags = tags.map((tag) => `[${operation.id}](${buildOperationDocsUrl(operation.method, path, tag)})`);

    const tsdocEnhancements = [
      `**${method} ${path}** ·· ${seeTags.join(' ·· ')} ·· _${tags.join('_')}_`,
      '',
      `@param {${operation.id}Data} options`,
      ...paramTags,
    ];

    const returnCodes = extractResponseCodes(responses);
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
 * Generates TSDoc `@param` tags for path or query parameters.
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
 * Generates TSDoc `@param` tags for request body properties.
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
