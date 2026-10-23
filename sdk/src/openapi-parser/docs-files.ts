import { parseOpenApiSpec } from './parse-spec.ts';
import type { OpenApiSpec } from './types.ts';

/**
 * The docs JSON the frontend serves under `/static/docs.gen/`, derived from the spec: each file's path in that folder,
 * mapped to its compact JSON. Operation details come per tag, so the docs page loads only the tags it opens.
 */
export const buildDocsFiles = (spec: OpenApiSpec): Map<string, string> => {
  const parsed = parseOpenApiSpec(spec);
  const files = new Map<string, string>();
  for (const [tagName, tagOperations] of parsed.tagDetails) files.set(`details.gen/${tagName}.gen.json`, JSON.stringify(tagOperations));
  files.set('operations.gen.json', JSON.stringify(parsed.operations));
  files.set('tags.gen.json', JSON.stringify(parsed.tags));
  files.set('info.gen.json', JSON.stringify(parsed.info));
  files.set('schemas.gen.json', JSON.stringify(parsed.schemas));
  files.set('schema-tags.gen.json', JSON.stringify(parsed.schemaTags));
  return files;
};
