import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Compile-time drift guard for the placeholder config template.
 *
 * `configs/default-config.ts.template` is copied as plain text by create-cella, so it is
 * never type-checked during a normal build — that is why structural changes to the real
 * `shared/config/config.default.ts` (e.g. the `services` block, `has` flags) can silently
 * drift out of sync.
 *
 * This test interpolates the template tokens, rewires its imports to the real repo types,
 * and runs the TypeScript compiler over it. The template ends with `satisfies RequiredConfig`,
 * so any missing/extra/mistyped field surfaces here as a compiler diagnostic.
 */
describe('placeholder config template type-checks against RequiredConfig', () => {
  const repoRoot = resolve(import.meta.dirname, '../../..');
  const templatePath = resolve(import.meta.dirname, '../configs/default-config.ts.template');
  const realTypesPath = resolve(repoRoot, 'shared/src/config-builder/types');

  let dir: string;
  let tempFile: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'cella-cfg-typecheck-'));
    tempFile = join(dir, 'placeholder-config.ts');

    let source = readFileSync(templatePath, 'utf8');

    // Interpolate tokens with valid placeholder values (same as create-cella does at runtime).
    source = source.replaceAll('__project_name__', 'My App').replaceAll('__project_slug__', 'my-app');

    // Rewire imports so the standalone temp file resolves against the real repo types.
    source = source.replace(/from '\.\.\/src\/config-builder\/types'/, `from '${realTypesPath}'`);

    // Drop the hierarchy re-export: it pulls in unrelated value code and is irrelevant to
    // validating the shape of the `config` object.
    source = source.replace(/export \{ roles, hierarchy \} from '\.\/hierarchy-config';/, '');

    writeFileSync(tempFile, source, 'utf8');
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('produces no type errors when the template satisfies RequiredConfig', () => {
    const program = ts.createProgram([tempFile], {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowImportingTsExtensions: true,
    });

    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .filter((d) => d.file?.fileName === tempFile.split('\\').join('/') || d.file?.fileName === tempFile);

    const messages = diagnostics.map((d) => {
      const text = ts.flattenDiagnosticMessageText(d.messageText, '\n');
      if (d.file && d.start !== undefined) {
        const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
        return `L${line + 1}:${character + 1} ${text}`;
      }
      return text;
    });

    expect(messages, `Template drifted from RequiredConfig:\n${messages.join('\n')}`).toEqual([]);
  });
});
