/**
 * OpenAPI Parser Plugin for API Documentation
 *
 * Transforms OpenAPI spec into lightweight operation summaries for docs UI.
 * Generates JSON files in public/static/docs.gen for runtime fetching:
 * - operations.json, tags.json, schemas.json, info.json
 * - details/{tagName}.json for per-tag operation details
 *
 * All data is fetched at runtime via React Query to reduce bundle size.
 */

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
 * Handler function for the openapi-parser plugin.
 * Orchestrates parsing and JSON file generation.
 */
const handler: OpenApiParserPlugin['Handler'] = ({ plugin }) => {
  // Parse the OpenAPI spec (pure function)
  const spec = plugin.context.spec as OpenApiSpec;
  const parsed = parseOpenApiSpec(spec);

  // Use configured docsOutputPath if provided, otherwise default to public/static/docs.gen
  const publicDocsDir = plugin.config.docsOutputPath
    ? plugin.config.docsOutputPath
    : resolve(plugin.context.config.output.path, '../../public/static/docs.gen');

  mkdirSync(publicDocsDir, { recursive: true });

  // Create details.gen subdirectory in public for per-tag JSON files
  const publicDetailsDir = resolve(publicDocsDir, 'details.gen');
  mkdirSync(publicDetailsDir, { recursive: true });

  // Generate per-tag detail JSON files (pretty-printed for readability)
  for (const [tagName, tagOperations] of parsed.tagDetails.entries()) {
    const tagJsonPath = resolve(publicDetailsDir, `${tagName}.gen.json`);
    writeFileSync(tagJsonPath, formatJson(tagOperations), 'utf-8');
  }

  // Write JSON files to public/static/docs.gen for runtime fetching (reduces bundle size)
  writeFileSync(resolve(publicDocsDir, 'operations.gen.json'), formatJson(parsed.operations), 'utf-8');
  writeFileSync(resolve(publicDocsDir, 'tags.gen.json'), formatJson(parsed.tags), 'utf-8');
  writeFileSync(resolve(publicDocsDir, 'info.gen.json'), formatJson(parsed.info), 'utf-8');
  writeFileSync(resolve(publicDocsDir, 'schemas.gen.json'), formatJson(parsed.schemas), 'utf-8');
  writeFileSync(resolve(publicDocsDir, 'schema-tags.gen.json'), formatJson(parsed.schemaTags), 'utf-8');
};

/**
 * Default plugin configuration
 */
export const defaultConfig: OpenApiParserPlugin['Config'] = {
  dependencies: ['@hey-api/typescript'],
  handler,
  name: 'openapi-parser',
  config: {
    output: 'docs-operations',
  },
};

/**
 * Plugin factory function
 */
export const defineConfig = definePluginConfig(defaultConfig);

export default defineConfig;
