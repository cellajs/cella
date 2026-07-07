import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DefinePlugin } from '@hey-api/openapi-ts';
import { definePluginConfig } from '@hey-api/openapi-ts';
import { formatJson } from './format-json';
import { parseOpenApiSpec } from './parse-spec';
import type { OpenApiSpec } from './types';

/**
 * Configuration options for the openapi-parser plugin.
 * @property docsOutputPath - Optional absolute path for docs.gen output (used for temp folder generation)
 */
type Config = {
  name: 'openapi-parser';
  output?: string;
  docsOutputPath?: string;
};

type OpenApiParserPlugin = DefinePlugin<Config>;

/**
 * Handler for the openapi-parser plugin: transforms the OpenAPI spec into lightweight
 * operation/tag/schema summaries and writes them as JSON to the docs.gen folder
 * (operations, tags, schemas, info, and per-tag details), fetched at runtime via
 * React Query to keep the SDK bundle small.
 */
const handler: OpenApiParserPlugin['Handler'] = ({ plugin }) => {
  // Parse the OpenAPI spec (pure function)
  const spec = plugin.context.spec as OpenApiSpec;
  const parsed = parseOpenApiSpec(spec);

  // Use configured docsOutputPath if provided, otherwise default to <output>/docs.gen
  const publicDocsDir = plugin.config.docsOutputPath
    ? plugin.config.docsOutputPath
    : resolve(plugin.context.config.output.path, 'docs.gen');

  mkdirSync(publicDocsDir, { recursive: true });

  // Create details.gen subdirectory in public for per-tag JSON files
  const publicDetailsDir = resolve(publicDocsDir, 'details.gen');
  mkdirSync(publicDetailsDir, { recursive: true });

  // Generate per-tag detail JSON files (pretty-printed for readability)
  for (const [tagName, tagOperations] of parsed.tagDetails.entries()) {
    const tagJsonPath = resolve(publicDetailsDir, `${tagName}.gen.json`);
    writeFileSync(tagJsonPath, formatJson(tagOperations), 'utf-8');
  }

  // Write docs JSON files for runtime fetching (reduces bundle size)
  writeFileSync(resolve(publicDocsDir, 'operations.gen.json'), formatJson(parsed.operations), 'utf-8');
  writeFileSync(resolve(publicDocsDir, 'tags.gen.json'), formatJson(parsed.tags), 'utf-8');
  writeFileSync(resolve(publicDocsDir, 'info.gen.json'), formatJson(parsed.info), 'utf-8');
  writeFileSync(resolve(publicDocsDir, 'schemas.gen.json'), formatJson(parsed.schemas), 'utf-8');
  writeFileSync(resolve(publicDocsDir, 'schema-tags.gen.json'), formatJson(parsed.schemaTags), 'utf-8');
};

const defaultConfig: OpenApiParserPlugin['Config'] = {
  dependencies: ['@hey-api/typescript'],
  handler,
  name: 'openapi-parser',
  config: {
    output: 'docs-operations',
  },
};

export const defineConfig = definePluginConfig(defaultConfig);
