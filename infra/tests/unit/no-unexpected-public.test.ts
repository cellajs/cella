import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Finding {
  resource: string;
  line: number;
  text: string;
  pattern: string;
}

const PATTERNS: Array<{ name: string; rx: RegExp }> = [
  { name: 'principal-wildcard', rx: /Principal['"]?\s*:\s*['"]\*['"]/ },
  { name: 'cidr-any-ipv4', rx: /['"]0\.0\.0\.0\/0['"]/ },
  { name: 'cidr-any-ipv6', rx: /['"]::\/0['"]/ },
  { name: 'cors-allowed-origins-wildcard', rx: /allowedOrigins:\s*\[\s*['"]\*['"]/ },
  { name: 'public-bucket-flag', rx: /isPublic:\s*true/ },
  // A managed database gets its public endpoint from an unconditional `loadBalancer: {}`; the resource only sets it behind the operator's exposure config.
  { name: 'public-db-endpoint', rx: /loadBalancer:\s*\{/ },
  { name: 'inbound-accept-default', rx: /inboundDefaultPolicy:\s*['"]accept['"]/ },
];

// Allowlist of intentional public resources, format `<resource>:<pattern-name>`. Keep it short.
const EXPECTED = new Set<string>([
  // Frontend SPA bucket and public-uploads bucket: anonymous object reads (resources/storage.test.ts pins the statements to GetObject).
  'storage.ts:principal-wildcard',
]);

const resourcesDir = resolve(__dirname, '../../resources');

/** Every source file under resources/, including the store plugins, without the tests. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

function scan(): Finding[] {
  const findings: Finding[] = [];
  for (const file of sourceFiles(resourcesDir)) {
    const resource = relative(resourcesDir, file);
    const lines = readFileSync(file, 'utf-8').split('\n');
    for (const [i, line] of lines.entries()) {
      for (const p of PATTERNS) {
        if (p.rx.test(line)) findings.push({ resource, line: i + 1, text: line.trim(), pattern: p.name });
      }
    }
  }
  return findings;
}

// Scans resources for public buckets, registries, DB endpoints, and ingress.
// Intentional public surfaces must be listed in EXPECTED.
describe('no-unexpected-public sweep', () => {
  it('every public-surface pattern is in the EXPECTED allowlist, and every allowlist entry is live', () => {
    const findings = scan();
    const keys = new Set(findings.map((f) => `${f.resource}:${f.pattern}`));

    const unexpected: string[] = [];
    for (const k of keys) {
      if (!EXPECTED.has(k)) {
        const occurrences = findings.filter((f) => `${f.resource}:${f.pattern}` === k);
        unexpected.push(`  ${k}:\n${occurrences.map((o) => `    ${o.resource}:${o.line}  ${o.text}`).join('\n')}`);
      }
    }

    if (unexpected.length > 0) {
      throw new Error(
        `Found ${unexpected.length} unexpected public-surface pattern(s).\n` +
          'Either remove the public surface or add the key to EXPECTED with a justification comment.\n\n' +
          unexpected.join('\n\n'),
      );
    }
    // An allowlist entry nothing matches means its pattern no longer sees the surface it was written for.
    for (const expected of EXPECTED) expect(keys, `stale allowlist entry ${expected}`).toContain(expected);
  });

  // Exposure keys belong only in the gitignored Pulumi.<env>.exposure.yaml overlay; a committed key would make every CI deploy re-converge the public endpoint open.
  it('no committed stack config records DB-exposure keys', () => {
    const infraRoot = resolve(__dirname, '../..');
    const offenders: string[] = [];
    for (const file of readdirSync(infraRoot)) {
      if (!/^Pulumi\..+\.yaml$/.test(file) || file.endsWith('.exposure.yaml')) continue;
      const src = readFileSync(resolve(infraRoot, file), 'utf-8');
      if (/dbPublicEndpoint:\s*["']?true/.test(src) || /dbPublicAcl/.test(src)) offenders.push(file);
    }
    expect(
      offenders,
      `DB-exposure keys found in committed stack config: ${offenders.join(', ')}. ` +
        'Run "Stop public DB exposure" (infra CLI) and remove the keys; exposure belongs in the gitignored overlay.',
    ).toEqual([]);
  });
});
