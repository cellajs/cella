export type DefinitionIndex = Map<string, string>;

/** Index every exported definition of a TS source file as Map<exportName, fullDefinitionCode>. */
export function buildIndex(content: string): DefinitionIndex {
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

const toPascalCase = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

/** The definitions the index holds under these names, headed by their sdk source file, or a comment naming what is missing. */
function definitionCode(index: DefinitionIndex, names: string[], file: 'zod.gen.ts' | 'types.gen.ts') {
  const definitions = names.flatMap((name) => index.get(name) ?? []);
  if (!definitions.length) return `// ${names.join(' / ')} not found in sdk/${file}`;
  return `// From sdk/${file}\n${definitions.join('\n\n')}`;
}

export const getZodCodeForSchema = (zodIndex: DefinitionIndex, schemaName: string) => definitionCode(zodIndex, [`z${schemaName}`], 'zod.gen.ts');

export const getTypeCodeForSchema = (typesIndex: DefinitionIndex, schemaName: string) => definitionCode(typesIndex, [schemaName], 'types.gen.ts');

/** Error responses (status >= 400) resolve by responseName, success responses by operationId + 'Response'. */
export const getZodCodeForResponse = (zodIndex: DefinitionIndex, operationId: string, status: number, responseName?: string) =>
  getZodCodeForSchema(zodIndex, status >= 400 && responseName ? responseName : `${toPascalCase(operationId)}Response`);

export const getTypeCodeForResponse = (typesIndex: DefinitionIndex, operationId: string, status: number) =>
  definitionCode(typesIndex, [`${toPascalCase(operationId)}${status >= 200 && status < 300 ? 'Responses' : 'Errors'}`], 'types.gen.ts');

/** Combines the available Path / Query / Body schemas: zod.gen.ts has no composite `Data` schema. */
export const getZodCodeForRequest = (zodIndex: DefinitionIndex, operationId: string) =>
  definitionCode(
    zodIndex,
    ['Path', 'Query', 'Body'].map((part) => `z${toPascalCase(operationId)}${part}`),
    'zod.gen.ts',
  );

export const getTypeCodeForRequest = (typesIndex: DefinitionIndex, operationId: string) =>
  definitionCode(typesIndex, [`${toPascalCase(operationId)}Data`], 'types.gen.ts');
