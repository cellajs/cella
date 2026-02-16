import { queryOptions } from '@tanstack/react-query';

/**
 * Query options for lazily loading types.gen.ts content.
 * Uses dynamic import to code-split the raw content.
 */
export const typesContentQueryOptions = queryOptions({
  queryKey: ['docs', 'types-content'],
  queryFn: async () => {
    const module = await import('~/api.gen/types.gen.ts?raw');
    return module.default as string;
  },
  staleTime: Number.POSITIVE_INFINITY,
});

/**
 * Query options for lazily loading zod.gen.ts content.
 * Uses dynamic import to code-split the raw content.
 */
export const zodContentQueryOptions = queryOptions({
  queryKey: ['docs', 'zod-content'],
  queryFn: async () => {
    const module = await import('~/api.gen/zod.gen.ts?raw');
    return module.default as string;
  },
  staleTime: Number.POSITIVE_INFINITY,
});

/**
 * Convert operation ID to PascalCase.
 * e.g., 'getMe' -> 'GetMe'
 */
const toPascalCase = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

/**
 * Extract a const/type definition from source content.
 * Finds the start of the definition and tracks braces to find the end.
 */
const extractDefinition = (content: string, pattern: RegExp, startsWithBrace = false): string | null => {
  const match = pattern.exec(content);
  if (!match) return null;

  const startIndex = match.index;
  let endIndex = match.index + match[0].length;

  // If pattern ends with opening brace, initialize count to 1
  let braceCount = startsWithBrace ? 1 : 0;
  let parenCount = 0;
  let started = startsWithBrace;

  // Find the end by tracking balanced braces/parens
  while (endIndex < content.length) {
    const char = content[endIndex];

    if (char === '(' || char === '{') {
      started = true;
      if (char === '(') parenCount++;
      if (char === '{') braceCount++;
    }
    if (char === ')') parenCount--;
    if (char === '}') braceCount--;

    endIndex++;

    // End when we've closed all braces/parens after starting
    if (started && braceCount === 0 && parenCount === 0) {
      // Skip to semicolon or newline
      while (endIndex < content.length && content[endIndex] !== ';' && content[endIndex] !== '\n') {
        endIndex++;
      }
      if (content[endIndex] === ';') endIndex++;
      break;
    }
  }

  return content.slice(startIndex, endIndex).trim();
};

/**
 * Get the Zod schema code for a specific operation response.
 * For error responses (status >= 400), uses responseName (e.g., 'BadRequestError').
 * For success responses, uses operationId + 'Response' (e.g., 'GetMeResponse').
 */
export const getZodCodeForResponse = (
  zodContent: string,
  operationId: string,
  status: number,
  responseName?: string,
): string => {
  const isError = status >= 400;
  const schemaName = isError && responseName ? responseName : `${toPascalCase(operationId)}Response`;

  const pattern = new RegExp(`export const z${schemaName} = `);
  const definition = extractDefinition(zodContent, pattern);

  if (!definition) {
    return `// Schema z${schemaName} not found in zod.gen.ts`;
  }

  return `// From ~/api.gen/zod.gen.ts\n${definition}`;
};

/**
 * Get the TypeScript type code for a specific operation response.
 */
export const getTypeCodeForResponse = (typesContent: string, operationId: string, status: number): string => {
  const pascalCaseOpId = toPascalCase(operationId);
  const isSuccess = status >= 200 && status < 300;
  const typeName = isSuccess ? `${pascalCaseOpId}Responses` : `${pascalCaseOpId}Errors`;

  // Pattern includes opening brace, so pass startsWithBrace = true
  const pattern = new RegExp(`export type ${typeName} = \\{`);
  const definition = extractDefinition(typesContent, pattern, true);

  if (!definition) {
    return `// Type ${typeName} not found in api.gen.ts`;
  }

  return `// From ~/api.gen\n${definition}`;
};

/**
 * Get the Zod schema code for a specific operation request (Data).
 */
export const getZodCodeForRequest = (zodContent: string, operationId: string): string => {
  const pascalCaseOpId = toPascalCase(operationId);
  const schemaName = `z${pascalCaseOpId}Data`;

  const pattern = new RegExp(`export const ${schemaName} = `);
  const definition = extractDefinition(zodContent, pattern);

  if (!definition) {
    return `// Schema ${schemaName} not found in zod.gen.ts`;
  }

  return `// From ~/api.gen/zod.gen.ts\n${definition}`;
};

/**
 * Get the TypeScript type code for a specific operation request (Data).
 */
export const getTypeCodeForRequest = (typesContent: string, operationId: string): string => {
  const pascalCaseOpId = toPascalCase(operationId);
  const typeName = `${pascalCaseOpId}Data`;

  // Pattern includes opening brace, so pass startsWithBrace = true
  const pattern = new RegExp(`export type ${typeName} = \\{`);
  const definition = extractDefinition(typesContent, pattern, true);

  if (!definition) {
    return `// Type ${typeName} not found in api.gen.ts`;
  }

  return `// From ~/api.gen\n${definition}`;
};

/**
 * Get the Zod schema code for a component schema by name.
 */
export const getZodCodeForSchema = (zodContent: string, schemaName: string): string => {
  const zodSchemaName = `z${schemaName}`;

  const pattern = new RegExp(`export const ${zodSchemaName} = `);
  const definition = extractDefinition(zodContent, pattern);

  if (!definition) {
    return `// Schema ${zodSchemaName} not found in zod.gen.ts`;
  }

  return `// From ~/api.gen/zod.gen.ts\n${definition}`;
};

/**
 * Get the TypeScript type code for a component schema by name.
 */
export const getTypeCodeForSchema = (typesContent: string, schemaName: string): string => {
  // Pattern includes opening brace, so pass startsWithBrace = true
  const pattern = new RegExp(`export type ${schemaName} = \\{`);
  const definition = extractDefinition(typesContent, pattern, true);

  if (!definition) {
    return `// Type ${schemaName} not found in types.gen.ts`;
  }

  return `// From ~/api.gen/types.gen.ts\n${definition}`;
};
