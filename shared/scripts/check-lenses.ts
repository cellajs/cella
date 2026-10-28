import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { appConfig } from '../index.ts';
import { deltaRenameMap } from '../src/schema-evolution/define.ts';
import { lenses } from '../src/schema-evolution/lens-list.ts';
import { repoRoot } from './repo-files.ts';

const lensDir = join(repoRoot, 'shared/src/schema-evolution');

const datedLensFile = /^\d{4}-\d{2}-\d{2}-.+\.ts$/;

/** Fields no lens delta may touch: the frozen envelope, the fields the CDC counters read and the embedding host columns. */
const reservedFields = new Set<string>([
  // The frozen envelope
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
  // CDC counter logic reads (cdc/src/utils/count-deltas.ts)
  'role',
  'rejectedAt',
  // Declared entity-embedding host columns
  ...appConfig.productEmbeddings.map((embedding) => embedding.hostColumn),
]);

const failures: string[] = [];

/** Whether the repo is a git work tree, whose history the append-only check reads. */
function gitAvailable(): boolean {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: repoRoot, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** The dated lens modules (`YYYY-MM-DD-<name>.ts`) in the lens folder. */
function datedLensFiles(): string[] {
  return readdirSync(lensDir).filter((file) => datedLensFile.test(file));
}

/** A dated lens module is byte-identical to the version its first commit added. */
function checkAppendOnly(files: string[]) {
  if (!gitAvailable()) {
    console.warn('[lens:check] git unavailable, skipping append-only check');
    return;
  }
  for (const file of files) {
    const abs = join(lensDir, file);
    const rel = relative(repoRoot, abs);
    let firstCommit: string;
    try {
      const log = execFileSync('git', ['log', '--diff-filter=A', '--follow', '--format=%H', '--', rel], { cwd: repoRoot, encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(Boolean);
      firstCommit = log[log.length - 1];
    } catch {
      continue;
    }
    if (!firstCommit) continue; // not yet committed, nothing to compare against
    const original = execFileSync('git', ['show', `${firstCommit}:${rel}`], { cwd: repoRoot, encoding: 'utf8' });
    const current = readFileSync(abs, 'utf8');
    if (original !== current) {
      failures.push(`Append-only violation: ${rel} changed since its first commit (${firstCommit.slice(0, 8)}).`);
    }
  }
}

/** Every field a lens delta names: both sides of a rename, and the field it adds, drops or retypes. */
function fieldsOf(delta: (typeof lenses)[number]['delta']): string[] {
  const fields: string[] = [];
  const rename = deltaRenameMap(delta);
  if (rename) fields.push(rename.from, rename.to);
  if ('add' in delta) fields.push(delta.add.field);
  if ('drop' in delta) fields.push(delta.drop.field);
  if ('retype' in delta) fields.push(delta.retype.field);
  return fields;
}

/** No lens touches a reserved field. */
function checkCollisions() {
  for (const lens of lenses) {
    for (const field of new Set(fieldsOf(lens.delta))) {
      if (reservedFields.has(field)) {
        failures.push(`Config collision: lens "${lens.id}" touches reserved/frozen field "${field}".`);
      }
    }
  }
}

/** A contract lens follows an expand lens of the same entity type on one of its fields. */
function checkExpandBeforeContract() {
  for (let i = 0; i < lenses.length; i++) {
    const lens = lenses[i];
    if (lens.phase !== 'contract') continue;
    const fields = fieldsOf(lens.delta);
    const hasExpand = lenses
      .slice(0, i)
      .some(
        (earlier) =>
          earlier.entityType === lens.entityType && earlier.phase === 'expand' && fieldsOf(earlier.delta).some((field) => fields.includes(field)),
      );
    if (!hasExpand) {
      failures.push(
        `Expand-before-contract violation: lens "${lens.id}" contracts ${lens.entityType} without a preceding expand lens on the same field.`,
      );
    }
  }
}

/** A dated lens module neither awaits nor imports dynamically. */
function checkPurity(files: string[]) {
  for (const file of files) {
    const source = readFileSync(join(lensDir, file), 'utf8');
    if (/\bawait\b/.test(source)) failures.push(`Purity violation: ${file} contains "await".`);
    if (/\bimport\s*\(/.test(source)) failures.push(`Purity violation: ${file} uses dynamic import().`);
  }
}

/** Every configured product and channel entity type calls its `evolutionContract` factory in `backend/src/modules`. */
function checkContractCompleteness() {
  const modulesDir = join(repoRoot, 'backend', 'src', 'modules');
  let combined = '';
  try {
    for (const entry of readdirSync(modulesDir, { recursive: true, encoding: 'utf8' })) {
      if (!entry.endsWith('.ts')) continue;
      combined += readFileSync(join(modulesDir, entry), 'utf8');
    }
  } catch {
    console.warn('[lens:check] backend/src/modules unavailable, skipping contract-completeness check');
    return;
  }
  for (const type of appConfig.productEntityTypes) {
    if (!combined.includes(`evolutionContract.product('${type}'`)) {
      failures.push(
        `Contract completeness: product entity "${type}" never calls evolutionContract.product('${type}', …) in backend/src/modules: its create/update body schemas skip the lens contract.`,
      );
    }
  }
  for (const type of appConfig.channelEntityTypes) {
    if (!combined.includes(`evolutionContract.channel('${type}'`)) {
      failures.push(
        `Contract completeness: channel entity "${type}" never calls evolutionContract.channel('${type}', …) in backend/src/modules: its create/update body schemas skip the lens contract.`,
      );
    }
  }
}

const files = datedLensFiles();
checkAppendOnly(files);
checkCollisions();
checkExpandBeforeContract();
checkPurity(files);
checkContractCompleteness();

if (failures.length > 0) {
  console.error(`[lens:check] ${failures.length} violation(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.info(`[lens:check] OK, ${lenses.length} lens(es), ${files.length} dated module(s) verified.`);
