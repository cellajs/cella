/**
 * CI guards for schema-evolution lenses. See README.md in this directory for what each
 * check enforces. Exit code 1 on any violation; run via `pnpm --filter shared lens:check`.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appConfig } from '../index';
import { deltaRenameMap } from '../src/schema-evolution/define';
import { lenses } from '../src/schema-evolution/lens-list';

const here = dirname(fileURLToPath(import.meta.url));
const lensDir = join(here, '..', 'src', 'schema-evolution');
const repoRoot = join(here, '..', '..');

const DATED_LENS = /^\d{4}-\d{2}-\d{2}-.+\.ts$/;

/** Frozen-envelope + reserved field names a lens delta must never rename to/from or add/drop. */
const RESERVED_FIELDS = new Set<string>([
  // Core / frozen envelope (D4)
  'id',
  'stx',
  'seq',
  'entityType',
  'organizationId',
  'tenantId',
  'createdAt',
  'createdBy',
  'updatedAt',
  'updatedBy',
  // CDC counter logic reads (cdc/src/utils/update-counts.ts)
  'role',
  'rejectedAt',
  // Declared entity-embedding host columns
  ...appConfig.entityEmbeddings.map((e) => e.hostColumn),
]);

const failures: string[] = [];

function gitAvailable(): boolean {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: repoRoot, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function datedLensFiles(): string[] {
  return readdirSync(lensDir).filter((f) => DATED_LENS.test(f));
}

// ── 1. Append-only lint ──
function checkAppendOnly(files: string[]) {
  if (!gitAvailable()) {
    console.warn('[lens:check] git unavailable — skipping append-only check');
    return;
  }
  for (const file of files) {
    const abs = join(lensDir, file);
    const rel = relative(repoRoot, abs);
    let firstCommit: string;
    try {
      const log = execFileSync('git', ['log', '--diff-filter=A', '--follow', '--format=%H', '--', rel], {
        cwd: repoRoot,
        encoding: 'utf8',
      })
        .trim()
        .split('\n')
        .filter(Boolean);
      firstCommit = log[log.length - 1];
    } catch {
      continue; // not yet committed, nothing to compare against
    }
    if (!firstCommit) continue;
    const original = execFileSync('git', ['show', `${firstCommit}:${rel}`], { cwd: repoRoot, encoding: 'utf8' });
    const current = readFileSync(abs, 'utf8');
    if (original !== current) {
      failures.push(`Append-only violation: ${rel} changed since its first commit (${firstCommit.slice(0, 8)}).`);
    }
  }
}

// ── 2. Config-collision validator ──
function fieldsOf(delta: (typeof lenses)[number]['delta']): string[] {
  const fields: string[] = [];
  const rename = deltaRenameMap(delta);
  if (rename) fields.push(rename.from, rename.to);
  if ('add' in delta) fields.push(delta.add.field);
  if ('drop' in delta) fields.push(delta.drop.field);
  if ('retype' in delta) fields.push(delta.retype.field);
  return fields;
}

function checkCollisions() {
  for (const lens of lenses) {
    for (const field of new Set(fieldsOf(lens.delta))) {
      if (RESERVED_FIELDS.has(field)) {
        failures.push(`Config collision: lens "${lens.id}" touches reserved/frozen field "${field}".`);
      }
    }
  }
}

// ── 2b. Contract invariant (1.3): contract requires a prior expand on the same field ──
function checkContractInvariant() {
  for (let i = 0; i < lenses.length; i++) {
    const lens = lenses[i];
    if (lens.phase !== 'contract') continue;
    const fields = fieldsOf(lens.delta);
    const hasExpand = lenses
      .slice(0, i)
      .some(
        (prev) =>
          prev.entityType === lens.entityType &&
          prev.phase === 'expand' &&
          fieldsOf(prev.delta).some((f) => fields.includes(f)),
      );
    if (!hasExpand) {
      failures.push(
        `Contract invariant: lens "${lens.id}" contracts ${lens.entityType} without a preceding expand lens on the same field.`,
      );
    }
  }
}

// ── 3. Lens purity lint ──
function checkPurity(files: string[]) {
  for (const file of files) {
    const source = readFileSync(join(lensDir, file), 'utf8');
    if (/\bawait\b/.test(source)) failures.push(`Purity violation: ${file} contains "await".`);
    if (/\bimport\s*\(/.test(source)) failures.push(`Purity violation: ${file} uses dynamic import().`);
  }
}

// ── 4. Contract completeness ──
function checkContractCompleteness() {
  const modulesDir = join(repoRoot, 'backend', 'src', 'modules');
  let combined = '';
  try {
    for (const entry of readdirSync(modulesDir, { recursive: true }) as string[]) {
      if (!entry.endsWith('.ts')) continue;
      combined += readFileSync(join(modulesDir, entry), 'utf8');
    }
  } catch {
    console.warn('[lens:check] backend/src/modules unavailable — skipping contract-completeness check');
    return;
  }
  for (const type of appConfig.productEntityTypes) {
    if (!combined.includes(`evolutionContract.product('${type}'`)) {
      failures.push(
        `Contract completeness: product entity "${type}" never calls evolutionContract.product('${type}', …) in backend/src/modules — its create/update body schemas bypass the lens seams.`,
      );
    }
  }
  for (const type of appConfig.channelEntityTypes) {
    if (!combined.includes(`evolutionContract.channel('${type}'`)) {
      failures.push(
        `Contract completeness: context entity "${type}" never calls evolutionContract.channel('${type}', …) in backend/src/modules — its create/update body schemas bypass the lens seams.`,
      );
    }
  }
}

const files = datedLensFiles();
checkAppendOnly(files);
checkCollisions();
checkContractInvariant();
checkPurity(files);
checkContractCompleteness();

if (failures.length > 0) {
  console.error(`[lens:check] ${failures.length} violation(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`[lens:check] OK — ${lenses.length} lens(es), ${files.length} dated module(s) verified.`);
