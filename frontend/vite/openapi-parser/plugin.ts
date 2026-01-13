/**
 * OpenAPI Parser Plugin for API Documentation
 *
 * Transforms OpenAPI spec into lightweight operation summaries for docs UI.
 * Generates two arrays:
 * - operations: Minimal data for table rows and sidebar
 * - tags: Tag metadata with operation counts
 *
 * Secondary data (full descriptions, parameters, schemas) is accessed
 * on-demand from the full OpenAPI spec.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DefinePlugin } from '@hey-api/openapi-ts';
import { definePluginConfig } from '@hey-api/openapi-ts';
import {
  generateIndexFile,
  generateInfoFile,
  generateOperationsFile,
  generateSchemasFile,
  generateTagDetailsFile,
  generateTagsFile,
} from './file-generators';
import { parseOpenApiSpec } from './parse-spec';
import type { OpenApiSpec } from './types';

/**
 * Configuration options for the openapi-parser plugin.
 */
type Config = {
  name: 'openapi-parser';
  output?: string;
};

type OpenApiParserPlugin = DefinePlugin<Config>;

/**
 * Handler function for the openapi-parser plugin.
 * Orchestrates parsing and file generation.
 */
const handler: OpenApiParserPlugin['Handler'] = ({ plugin }) => {
  // Parse the OpenAPI spec (pure function)
  const spec = plugin.context.spec as OpenApiSpec;
  const parsed = parseOpenApiSpec(spec);

  // Generate file contents
  const operationsContent = generateOperationsFile(parsed.operations);
  const tagsContent = generateTagsFile(parsed.tags);
  const infoContent = generateInfoFile(parsed.info);
  const schemasContent = generateSchemasFile(parsed.schemas, parsed.schemaTags);

  // Create docs directory
  const docsDir = resolve(plugin.context.config.output.path, 'docs');
  mkdirSync(docsDir, { recursive: true });

  // Create details subdirectory for per-tag detail files
  const detailsDir = resolve(docsDir, 'details');
  mkdirSync(detailsDir, { recursive: true });

  // Generate per-tag detail files
  const tagNames: string[] = [];
  for (const [tagName, tagOperations] of parsed.tagDetails.entries()) {
    const tagDetailsContent = generateTagDetailsFile(tagName, tagOperations);
    const tagFilePath = resolve(detailsDir, `${tagName}.gen.ts`);
    writeFileSync(tagFilePath, tagDetailsContent, 'utf-8');
    tagNames.push(tagName);
  }

  // Generate index file
  const indexContent = generateIndexFile(tagNames);

  // Write files to docs directory
  writeFileSync(resolve(docsDir, 'operations.gen.ts'), operationsContent, 'utf-8');
  writeFileSync(resolve(docsDir, 'tags.gen.ts'), tagsContent, 'utf-8');
  writeFileSync(resolve(docsDir, 'info.gen.ts'), infoContent, 'utf-8');
  writeFileSync(resolve(docsDir, 'schemas.gen.ts'), schemasContent, 'utf-8');
  writeFileSync(resolve(docsDir, 'index.ts'), indexContent, 'utf-8');
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
