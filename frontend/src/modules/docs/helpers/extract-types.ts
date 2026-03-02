import { queryOptions } from '@tanstack/react-query';

export type DefinitionIndex = Map<string, string>;

/**
 * Build an index of all exported definitions from a TS source file in one pass.
 * Returns a Map<exportName, fullDefinitionCode> for O(1) lookups.
 */
function buildIndex(content: string): DefinitionIndex {
  const index: DefinitionIndex = new Map();
  const exportRegex = /^export (?:const|type) (\w+)/gm;
  let match: RegExpExecArray | null;

  while ((match = exportRegex.exec(content)) !== null) {
    const name = match[1];
    const startIndex = match.index;

    // Find `=` after the declaration
    let endIndex = startIndex + match[0].length;
    while (endIndex < content.length && content[endIndex] !== '=' && content[endIndex] !== '\n') endIndex++;
    if (content[endIndex] !== '=') continue;
    endIndex++; // skip '='
    while (endIndex < content.length && content[endIndex] === ' ') endIndex++;

    const startsWithBrace = content[endIndex] === '{';
    let braceCount = startsWithBrace ? 1 : 0;
    let parenCount = 0;
    let started = startsWithBrace;
    if (startsWithBrace) endIndex++;

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

      if (started && braceCount === 0 && parenCount === 0) {
        while (endIndex < content.length && content[endIndex] !== ';' && content[endIndex] !== '\n') endIndex++;
        if (content[endIndex] === ';') endIndex++;
        break;
      }
    }

    index.set(name, content.slice(startIndex, endIndex).trim());
  }

  return index;
}

/**
 * Query options for lazily loading and indexing zod.gen.ts definitions.
 * Parses all exports in one pass on first access; subsequent lookups are O(1).
 */
export const zodIndexQueryOptions = queryOptions({
  queryKey: ['docs', 'zod-index'],
  queryFn: async () => {
    const module = await import('~/api.gen/zod.gen.ts?raw');
    return buildIndex(module.default as string);
  },
  staleTime: Number.POSITIVE_INFINITY,
});

/**
 * Query options for lazily loading and indexing types.gen.ts definitions.
 * Parses all exports in one pass on first access; subsequent lookups are O(1).
 */
export const typesIndexQueryOptions = queryOptions({
  queryKey: ['docs', 'types-index'],
  queryFn: async () => {
    const module = await import('~/api.gen/types.gen.ts?raw');
    return buildIndex(module.default as string);
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
 * Get the Zod schema code for a specific operation response.
 * For error responses (status >= 400), uses responseName (e.g., 'BadRequestError').
 * For success responses, uses operationId + 'Response' (e.g., 'GetMeResponse').
 */
export const getZodCodeForResponse = (
  zodIndex: DefinitionIndex,
  operationId: string,
  status: number,
  responseName?: string,
): string => {
  const isError = status >= 400;
  const schemaName = isError && responseName ? responseName : `${toPascalCase(operationId)}Response`;
  const name = `z${schemaName}`;
  const definition = zodIndex.get(name);

  if (!definition) {
    return `// Schema ${name} not found in zod.gen.ts`;
  }

  return `// From ~/api.gen/zod.gen.ts\n${definition}`;
};

/**
 * Get the TypeScript type code for a specific operation response.
 */
export const getTypeCodeForResponse = (typesIndex: DefinitionIndex, operationId: string, status: number): string => {
  const pascalCaseOpId = toPascalCase(operationId);
  const isSuccess = status >= 200 && status < 300;
  const typeName = isSuccess ? `${pascalCaseOpId}Responses` : `${pascalCaseOpId}Errors`;
  const definition = typesIndex.get(typeName);

  if (!definition) {
    return `// Type ${typeName} not found in api.gen.ts`;
  }

  return `// From ~/api.gen\n${definition}`;
};

/**
 * Get the Zod schema code for a specific operation request (Data).
 */
export const getZodCodeForRequest = (zodIndex: DefinitionIndex, operationId: string): string => {
  const name = `z${toPascalCase(operationId)}Data`;
  const definition = zodIndex.get(name);

  if (!definition) {
    return `// Schema ${name} not found in zod.gen.ts`;
  }

  return `// From ~/api.gen/zod.gen.ts\n${definition}`;
};

/**
 * Get the TypeScript type code for a specific operation request (Data).
 */
export const getTypeCodeForRequest = (typesIndex: DefinitionIndex, operationId: string): string => {
  const typeName = `${toPascalCase(operationId)}Data`;
  const definition = typesIndex.get(typeName);

  if (!definition) {
    return `// Type ${typeName} not found in api.gen.ts`;
  }

  return `// From ~/api.gen\n${definition}`;
};

/**
 * Get the Zod schema code for a component schema by name.
 */
export const getZodCodeForSchema = (zodIndex: DefinitionIndex, schemaName: string): string => {
  const name = `z${schemaName}`;
  const definition = zodIndex.get(name);

  if (!definition) {
    return `// Schema ${name} not found in zod.gen.ts`;
  }

  return `// From ~/api.gen/zod.gen.ts\n${definition}`;
};

/**
 * Get the TypeScript type code for a component schema by name.
 */
export const getTypeCodeForSchema = (typesIndex: DefinitionIndex, schemaName: string): string => {
  const definition = typesIndex.get(schemaName);

  if (!definition) {
    return `// Type ${schemaName} not found in types.gen.ts`;
  }

  return `// From ~/api.gen/types.gen.ts\n${definition}`;
};
