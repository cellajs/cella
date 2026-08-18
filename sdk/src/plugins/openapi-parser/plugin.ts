import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DefinePlugin } from '@hey-api/openapi-ts';
import { definePluginConfig } from '@hey-api/openapi-ts';
import { formatJson } from './format-json';
import { parseOpenApiSpec } from './parse-spec';
import type { OpenApiSpec } from './types';

/** @property docsOutputPath - Absolute path for docs.gen output, set during temp folder generation. */
type Config = {
  name: 'openapi-parser';
  output?: string;
  docsOutputPath?: string;
};

type OpenApiParserPlugin = DefinePlugin<Config>;

/** Writes operation, tag, schema, info, and per-tag summaries as JSON into docs.gen, fetched at runtime so the SDK bundle stays small. */
const handler: OpenApiParserPlugin['Handler'] = ({ plugin }) => {
  const spec = plugin.context.spec as OpenApiSpec;
  const parsed = parseOpenApiSpec(spec);

  const publicDocsDir = plugin.config.docsOutputPath
    ? plugin.config.docsOutputPath
    : resolve(plugin.context.config.output.path, 'docs.gen');

  mkdirSync(publicDocsDir, { recursive: true });

  const publicDetailsDir = resolve(publicDocsDir, 'details.gen');
  mkdirSync(publicDetailsDir, { recursive: true });

  for (const [tagName, tagOperations] of parsed.tagDetails.entries()) {
    const tagJsonPath = resolve(publicDetailsDir, `${tagName}.gen.json`);
    writeFileSync(tagJsonPath, formatJson(tagOperations), 'utf-8');
  }

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
