import { queryOptions } from '@tanstack/react-query';
import { appConfig } from 'shared';
import { versionedUrl } from '~/modules/docs/query';

export type DefinitionIndex = Map<string, string>;

/** Index every exported definition of a TS source file as Map<exportName, fullDefinitionCode>. */
function buildIndex(content: string): DefinitionIndex {
  const index: DefinitionIndex = new Map();
  const exportRegex = /^export (?:const|type) (\w+)/gm;
  let match: RegExpExecArray | null = exportRegex.exec(content);

  while (match !== null) {
    const name = match[1];
    const startIndex = match.index;

    // Find `=` after the declaration
    let endIndex = startIndex + match[0].length;
    while (endIndex < content.length && content[endIndex] !== '=' && content[endIndex] !== '\n') endIndex++;
    if (content[endIndex] !== '=') {
      match = exportRegex.exec(content);
      continue;
    }
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
    match = exportRegex.exec(content);
  }

  return index;
}

export const zodIndexQueryOptions = queryOptions({
  queryKey: ['docs', 'zod-index'],
  queryFn: async () => {
    const res = await fetch(versionedUrl(`${appConfig.frontendUrl}/static/zod.gen.ts`));
    return buildIndex(await res.text());
  },
  staleTime: Number.POSITIVE_INFINITY,
});

export const typesIndexQueryOptions = queryOptions({
  queryKey: ['docs', 'types-index'],
  queryFn: async () => {
    const res = await fetch(versionedUrl(`${appConfig.frontendUrl}/static/types.gen.ts`));
    return buildIndex(await res.text());
  },
  staleTime: Number.POSITIVE_INFINITY,
});

const toPascalCase = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

/** Error responses (status >= 400) resolve by responseName, success responses by operationId + 'Response'. */
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

  return `// From sdk/zod.gen.ts\n${definition}`;
};

export const getTypeCodeForResponse = (typesIndex: DefinitionIndex, operationId: string, status: number): string => {
  const pascalCaseOpId = toPascalCase(operationId);
  const isSuccess = status >= 200 && status < 300;
  const typeName = isSuccess ? `${pascalCaseOpId}Responses` : `${pascalCaseOpId}Errors`;
  const definition = typesIndex.get(typeName);

  if (!definition) {
    return `// Type ${typeName} not found in sdk exports`;
  }

  return `// From sdk\n${definition}`;
};

/** Combines the available Path / Query / Body schemas: zod.gen.ts has no composite `Data` schema. */
export const getZodCodeForRequest = (zodIndex: DefinitionIndex, operationId: string): string => {
  const base = `z${toPascalCase(operationId)}`;
  const parts = (['Path', 'Query', 'Body'] as const)
    .map((part) => zodIndex.get(`${base}${part}`))
    .filter((def): def is string => Boolean(def));

  if (parts.length === 0) {
    return `// No request schemas (${base}Path / ${base}Query / ${base}Body) found in zod.gen.ts`;
  }

  return `// From sdk/zod.gen.ts\n${parts.join('\n\n')}`;
};

export const getTypeCodeForRequest = (typesIndex: DefinitionIndex, operationId: string): string => {
  const typeName = `${toPascalCase(operationId)}Data`;
  const definition = typesIndex.get(typeName);

  if (!definition) {
    return `// Type ${typeName} not found in sdk exports`;
  }

  return `// From sdk\n${definition}`;
};

export const getZodCodeForSchema = (zodIndex: DefinitionIndex, schemaName: string): string => {
  const name = `z${schemaName}`;
  const definition = zodIndex.get(name);

  if (!definition) {
    return `// Schema ${name} not found in zod.gen.ts`;
  }

  return `// From sdk/zod.gen.ts\n${definition}`;
};

export const getTypeCodeForSchema = (typesIndex: DefinitionIndex, schemaName: string): string => {
  const definition = typesIndex.get(schemaName);

  if (!definition) {
    return `// Type ${schemaName} not found in types.gen.ts`;
  }

  return `// From sdk/types.gen.ts\n${definition}`;
};
