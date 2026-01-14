import { getRefId } from '@asteasolutions/zod-to-openapi';
import type { ZodType } from 'zod';
import { getExampleForSchema } from '../../../mocks/example-registry';

type ResponseConfig = { content?: { 'application/json'?: { schema?: unknown; example?: unknown } } };
type ResponsesConfig = { [statusCode: string]: unknown };

/**
 * Attempts to inject an example into a JSON response based on schema name.
 * Returns the original response if no example can be injected.
 */
export const tryInjectExample = <T>(response: T): T => {
  // Use type guard to safely access nested properties
  const resp = response as ResponseConfig;
  const jsonContent = resp.content?.['application/json'];

  // Skip if no schema or already has an example
  if (!jsonContent?.schema || jsonContent.example !== undefined) return response;

  // Look up example by schema name (cast required as getRefId expects ZodType)
  const schemaName = getRefId(jsonContent.schema as ZodType);
  if (!schemaName) return response;

  const example = getExampleForSchema(schemaName);
  if (!example) return response;

  // Return response with injected example, preserving original type
  return {
    ...response,
    content: {
      ...resp.content,
      'application/json': { ...jsonContent, example },
    },
  } as T;
};

/**
 * Injects examples into response content by looking up schema names in the example registry.
 * Only applies to 2xx success responses with application/json content.
 */
export const injectResponseExamples = <T extends ResponsesConfig>(responses: T): T => {
  if (!responses) return responses;

  const result: ResponsesConfig = {};
  for (const [statusCode, response] of Object.entries(responses)) {
    const status = Number.parseInt(statusCode, 10);
    const isSuccessStatus = !Number.isNaN(status) && status >= 200 && status < 300;
    result[statusCode] = isSuccessStatus ? tryInjectExample(response) : response;
  }
  return result as T;
};
