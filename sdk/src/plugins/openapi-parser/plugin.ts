import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DefinePlugin } from '@hey-api/openapi-ts';
import { definePluginConfig } from '@hey-api/openapi-ts';
import { formatJson } from './format-json';
import { parseOpenApiSpec } from './parse-spec';
import type { OpenApiSpec } from './types';

type Config = { name: 'openapi-parser' };

type OpenApiParserPlugin = DefinePlugin<Config>;

/** Writes operation, tag, schema, info, and per-tag summaries as JSON into docs.gen, fetched at runtime so the SDK bundle stays small. */
const handler: OpenApiParserPlugin['Handler'] = ({ plugin }) => {
  const parsed = parseOpenApiSpec(plugin.context.spec as OpenApiSpec);

  // Lives inside the generation output, so the incremental wrapper compares and copies all of sdk/gen as one tree.
  const docsDir = resolve(plugin.context.config.output.path, 'docs.gen');
  const detailsDir = resolve(docsDir, 'details.gen');
  mkdirSync(detailsDir, { recursive: true });

  for (const [tagName, tagOperations] of parsed.tagDetails) {
    writeFileSync(resolve(detailsDir, `${tagName}.gen.json`), formatJson(tagOperations), 'utf-8');
  }

  const summaries = {
    'operations.gen.json': parsed.operations,
    'tags.gen.json': parsed.tags,
    'info.gen.json': parsed.info,
    'schemas.gen.json': parsed.schemas,
    'schema-tags.gen.json': parsed.schemaTags,
  };
  for (const [fileName, data] of Object.entries(summaries)) {
    writeFileSync(resolve(docsDir, fileName), formatJson(data), 'utf-8');
  }
};

const defaultConfig: OpenApiParserPlugin['Config'] = { dependencies: ['@hey-api/typescript'], handler, name: 'openapi-parser', config: {} };

export const defineConfig = definePluginConfig(defaultConfig);
