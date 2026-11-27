import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../..');

const cliRange = (manifest: string): string | undefined => {
  const pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } = JSON.parse(
    readFileSync(path.join(repoRoot, manifest), 'utf8'),
  );
  return pkg.dependencies?.['@cellajs/cli'] ?? pkg.devDependencies?.['@cellajs/cli'];
};

describe('the engine version', () => {
  // The menu and CI run the root's copy; the engine image, the build machine and the Pulumi program run the cella package's.
  it('is one range in the root and in the cella package', () => {
    expect(cliRange('package.json')).toBeTypeOf('string');
    expect(cliRange('cella/package.json')).toBe(cliRange('package.json'));
  });
});
