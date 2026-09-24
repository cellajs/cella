import { describe, expect, it } from 'vitest';
import { comparePulumiVersions, parsePulumiVersion, pulumiCliLagWarning, sdkPulumiVersion } from './pulumi-version';

describe('pulumi versions', () => {
  it('parses the CLI output with or without the v prefix', () => {
    expect(parsePulumiVersion('v3.253.0\n')).toBe('3.253.0');
    expect(parsePulumiVersion('3.264.0')).toBe('3.264.0');
    expect(parsePulumiVersion('')).toBeUndefined();
    expect(parsePulumiVersion(undefined)).toBeUndefined();
  });
  it('compares numerically, not lexically', () => {
    expect(comparePulumiVersions('3.9.0', '3.100.0')).toBeLessThan(0);
    expect(comparePulumiVersions('3.263.0', '3.263.0')).toBe(0);
    expect(comparePulumiVersions('4.0.0', '3.999.9')).toBeGreaterThan(0);
  });
  it('warns only for a CLI older than the SDK', () => {
    expect(pulumiCliLagWarning('3.236.0', '3.263.0')).toMatch(
      /3\.236\.0 is older than .*3\.263\.0.*brew upgrade pulumi/,
    );
    expect(pulumiCliLagWarning('3.263.0', '3.263.0')).toBeUndefined();
    expect(pulumiCliLagWarning('3.270.0', '3.263.0')).toBeUndefined();
    expect(pulumiCliLagWarning(undefined, '3.263.0')).toBeUndefined();
  });
  it('reads the SDK version the workspace resolves', () => {
    expect(sdkPulumiVersion()).toMatch(/^3\.\d+\.\d+$/);
  });
});
