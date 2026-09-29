import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const runtimeSource = readFileSync(resolve(__dirname, 'rollout-runtime.ts'), 'utf-8');
const driverSource = readFileSync(resolve(__dirname, '../lib/stack/pulumi-driver.ts'), 'utf-8');

describe('rollout-runtime source contracts', () => {
  it('routes stack updates through the Automation API driver', () => {
    expect(runtimeSource).toMatch(/driver\.update\(\)/);
    expect(driverSource).toMatch(/LocalWorkspace\.createOrSelectStack/);
  });
});
