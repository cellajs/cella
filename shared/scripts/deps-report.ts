/** Dependency count and install-weight report over the pnpm graph; `pnpm deps`. @see README.md */
import { execFileSync } from 'node:child_process';
import { type Dirent, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

type PnpmNode = {
  from?: string;
  version?: string;
  path?: string;
  dependencies?: Record<string, PnpmNode>;
};

type PnpmImporter = {
  name: string;
  path: string;
  dependencies?: Record<string, PnpmNode>;
  devDependencies?: Record<string, PnpmNode>;
};

/** One direct dependency plus the closure it alone is responsible for. */
type DirectEntry = {
  name: string;
  version: string;
  kind: 'prod' | 'dev';
  /** Every external package reachable through this dep, itself included. */
  reach: number;
  /** Packages reachable through this dep and no other direct dep of the same workspace. */
  exclusive: number;
  /** Unpacked bytes of the exclusive set: what dropping this dep actually reclaims. */
  exclusiveBytes: number;
  reachBytes: number;
};

type WorkspaceReport = {
  name: string;
  directProd: number;
  directDev: number;
  treeProd: number;
  treeDev: number;
  bytesProd: number;
  bytesDev: number;
  direct: DirectEntry[];
};

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
};

const topCount = Number(option('top') ?? 8);
const jsonPath = option('json');
const onlyWorkspace = option('workspace');

// ── pnpm graph ──

function pnpmList(listArgs: string[]): PnpmImporter[] {
  const raw = execFileSync('pnpm', ['list', ...listArgs, '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });
  return JSON.parse(raw) as PnpmImporter[];
}

/**
 * A single `pnpm list -r` prints each subtree only under the first importer that reaches it, so every
 * workspace after the first would report an empty transitive tree. One filtered list per workspace
 * yields a complete tree for each.
 */
function loadImporters(): PnpmImporter[] {
  const members = pnpmList(['-r', '--depth', '-1']).filter((m) => m.name);
  const importers: PnpmImporter[] = [];
  for (const member of members) {
    if (onlyWorkspace && member.name !== onlyWorkspace) continue;
    process.stderr.write(`  listing ${member.name}\r`);
    importers.push(...pnpmList(['--filter', member.name, '--depth', 'Infinity']));
  }
  process.stderr.write(`${' '.repeat(40)}\r`);
  return importers;
}

/** Workspace links resolve inside the repo; only registry packages carry install weight. */
const isExternal = (node: PnpmNode) => Boolean(node.path?.includes('/.pnpm/'));

const idOf = (name: string, node: PnpmNode) => `${node.from ?? name}@${node.version ?? '?'}`;

// ── on-disk size ──

const sizeCache = new Map<string, number>();

/** Unpacked bytes of a package directory, excluding nested node_modules (counted as their own nodes). */
function directorySize(dir: string): number {
  let total = 0;
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += directorySize(full);
    } else if (entry.isFile()) {
      try {
        total += statSync(full).size;
      } catch {
        // Broken symlink or a file removed mid-walk: contributes nothing.
      }
    }
  }
  return total;
}

function packageSize(id: string, node: PnpmNode): number {
  const cached = sizeCache.get(id);
  if (cached !== undefined) return cached;
  const size = node.path ? directorySize(node.path) : 0;
  sizeCache.set(id, size);
  return size;
}

/** Every external package reachable from one direct dependency, keyed `name@version`. */
function closureOf(name: string, node: PnpmNode, into: Map<string, number>, seen: Set<string>) {
  if (!isExternal(node)) return;
  const id = idOf(name, node);
  if (seen.has(id)) return;
  seen.add(id);
  into.set(id, packageSize(id, node));
  for (const [childName, child] of Object.entries(node.dependencies ?? {})) {
    closureOf(childName, child, into, seen);
  }
}

// ── report ──

function analyze(importer: PnpmImporter): WorkspaceReport {
  const direct: DirectEntry[] = [];
  const closures = new Map<string, Map<string, number>>();

  for (const kind of ['prod', 'dev'] as const) {
    const deps = kind === 'prod' ? importer.dependencies : importer.devDependencies;
    for (const [name, node] of Object.entries(deps ?? {})) {
      if (!isExternal(node)) continue;
      const closure = new Map<string, number>();
      closureOf(name, node, closure, new Set());
      const key = `${kind}:${name}`;
      closures.set(key, closure);
      direct.push({
        name,
        version: node.version ?? '?',
        kind,
        reach: closure.size,
        reachBytes: [...closure.values()].reduce((a, b) => a + b, 0),
        exclusive: 0,
        exclusiveBytes: 0,
      });
    }
  }

  // A package is exclusive to a direct dep when no other direct dep of this workspace reaches it.
  const owners = new Map<string, number>();
  for (const closure of closures.values()) {
    for (const id of closure.keys()) owners.set(id, (owners.get(id) ?? 0) + 1);
  }
  for (const entry of direct) {
    const closure = closures.get(`${entry.kind}:${entry.name}`);
    if (!closure) continue;
    for (const [id, bytes] of closure) {
      if (owners.get(id) !== 1) continue;
      entry.exclusive += 1;
      entry.exclusiveBytes += bytes;
    }
  }

  const union = (kind: 'prod' | 'dev') => {
    const merged = new Map<string, number>();
    for (const [key, closure] of closures) {
      if (!key.startsWith(`${kind}:`)) continue;
      for (const [id, bytes] of closure) merged.set(id, bytes);
    }
    return merged;
  };
  const prod = union('prod');
  const dev = union('dev');
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

  return {
    name: importer.name,
    directProd: direct.filter((d) => d.kind === 'prod').length,
    directDev: direct.filter((d) => d.kind === 'dev').length,
    treeProd: prod.size,
    treeDev: dev.size,
    bytesProd: sum(prod),
    bytesDev: sum(dev),
    direct: direct.sort((a, b) => b.exclusiveBytes - a.exclusiveBytes),
  };
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const pad = (value: string | number, width: number) => String(value).padEnd(width);
const padStart = (value: string | number, width: number) => String(value).padStart(width);

function main() {
  const importers = loadImporters().filter((i) => i.name && (!onlyWorkspace || i.name === onlyWorkspace));
  const reports = importers.map(analyze).sort((a, b) => b.bytesProd + b.bytesDev - (a.bytesProd + a.bytesDev));

  console.log('\nInstall weight per workspace (unpacked, nested node_modules attributed to their own package)\n');
  console.log(
    `${pad('workspace', 14)}${padStart('direct', 8)}${padStart('tree', 8)}${padStart('prod MB', 11)}${padStart('dev MB', 11)}`,
  );
  console.log('─'.repeat(52));
  for (const r of reports) {
    console.log(
      pad(r.name, 14) +
        padStart(`${r.directProd}+${r.directDev}`, 8) +
        padStart(`${r.treeProd}+${r.treeDev}`, 8) +
        padStart(mb(r.bytesProd), 11) +
        padStart(mb(r.bytesDev), 11),
    );
  }

  const allIds = new Map<string, number>();
  for (const id of sizeCache.keys()) allIds.set(id, sizeCache.get(id) ?? 0);
  const byName = new Map<string, Set<string>>();
  for (const id of allIds.keys()) {
    const at = id.lastIndexOf('@');
    const name = id.slice(0, at);
    (byName.get(name) ?? byName.set(name, new Set()).get(name))?.add(id.slice(at + 1));
  }
  const duplicated = [...byName.entries()].filter(([, versions]) => versions.size > 1);
  const duplicateBytes = duplicated.reduce((total, [name, versions]) => {
    const sizes = [...versions].map((v) => allIds.get(`${name}@${v}`) ?? 0).sort((a, b) => b - a);
    return total + sizes.slice(1).reduce((a, b) => a + b, 0);
  }, 0);

  console.log('─'.repeat(52));
  const totalBytes = [...allIds.values()].reduce((a, b) => a + b, 0);
  console.log(`${pad('total', 14)}${padStart('', 8)}${padStart(allIds.size, 8)}${padStart(mb(totalBytes), 22)}`);
  console.log(
    `\n${duplicated.length} packages resolve to more than one version (${mb(duplicateBytes)} in redundant copies)`,
  );

  for (const r of reports) {
    const top = r.direct.filter((d) => d.exclusiveBytes > 0).slice(0, topCount);
    if (!top.length) continue;
    console.log(`\n${r.name} — heaviest direct deps by exclusive subtree (what dropping it reclaims)\n`);
    for (const d of top) {
      console.log(
        `  ${pad(`${d.name}@${d.version}`, 46)}${pad(d.kind, 6)}${padStart(`${d.exclusive}/${d.reach} pkgs`, 14)}${padStart(mb(d.exclusiveBytes), 11)}`,
      );
    }
  }

  if (jsonPath) {
    const snapshot = {
      totalPackages: allIds.size,
      totalBytes: [...allIds.values()].reduce((a, b) => a + b, 0),
      duplicatedNames: duplicated.length,
      duplicateBytes,
      workspaces: reports.map(({ direct, ...rest }) => ({ ...rest, direct: direct.slice(0, topCount) })),
    };
    writeFileSync(jsonPath, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(`\nSnapshot written to ${jsonPath}`);
  }
}

if (flag('help')) {
  console.log('Usage: node shared/scripts/deps-report.ts [--workspace <name>] [--top <n>] [--json <path>]');
} else {
  main();
}
