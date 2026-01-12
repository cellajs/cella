// Import the generated files as raw text using Vite's ?raw suffix
import typesContent from '~/api.gen/types.gen.ts?raw';
import zodContent from '~/api.gen/zod.gen.ts?raw';

/**
 * Convert operation ID to PascalCase.
 * e.g., 'getMe' -> 'GetMe', 'createUser' -> 'CreateUser'
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
 */
export const getZodCodeForResponse = (operationId: string): string => {
  const pascalCaseOpId = toPascalCase(operationId);
  const schemaName = `z${pascalCaseOpId}Response`;

  const pattern = new RegExp(`export const ${schemaName} = `);
  const definition = extractDefinition(zodContent, pattern);

  if (!definition) {
    return `// Schema ${schemaName} not found in zod.gen.ts`;
  }

  return `// From ~/api.gen/zod.gen.ts\n${definition}`;
};

/**
 * Get the TypeScript type code for a specific operation response.
 */
export const getTypeCodeForResponse = (operationId: string, status: number): string => {
  const pascalCaseOpId = toPascalCase(operationId);
  const isSuccess = status >= 200 && status < 300;
  const typeName = isSuccess ? `${pascalCaseOpId}Responses` : `${pascalCaseOpId}Errors`;

  // Pattern includes opening brace, so pass startsWithBrace = true
  const pattern = new RegExp(`export type ${typeName} = \\{`);
  const definition = extractDefinition(typesContent, pattern, true);

  if (!definition) {
    return `// Type ${typeName} not found in types.gen.ts`;
  }

  return `// From ~/api.gen/types.gen.ts\n${definition}`;
};

/**
 * Get the Zod schema code for a specific operation request (Data).
 */
export const getZodCodeForRequest = (operationId: string): string => {
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
export const getTypeCodeForRequest = (operationId: string): string => {
  const pascalCaseOpId = toPascalCase(operationId);
  const typeName = `${pascalCaseOpId}Data`;

  // Pattern includes opening brace, so pass startsWithBrace = true
  const pattern = new RegExp(`export type ${typeName} = \\{`);
  const definition = extractDefinition(typesContent, pattern, true);

  if (!definition) {
    return `// Type ${typeName} not found in types.gen.ts`;
  }

  return `// From ~/api.gen/types.gen.ts\n${definition}`;
};
