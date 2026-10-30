// Collects every GitHub advisory ever published for the repo's direct npm dependencies.
// Usage: node ghsa-intake.mjs <repoRoot> <outDir>
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [repo, outDir] = process.argv.slice(2);
const pkgDirs = ['.', ...readdirSync(repo).filter((d) => existsSync(join(repo, d, 'package.json')) && !d.startsWith('.') && d !== 'node_modules')];
const workspaceNames = new Set();
const deps = new Map(); // name -> Set of "<pkgDir>:<dependencies|devDependencies>"
for (const d of pkgDirs) {
  const p = JSON.parse(readFileSync(join(repo, d, 'package.json'), 'utf8'));
  workspaceNames.add(p.name);
  for (const kind of ['dependencies', 'devDependencies']) {
    for (const name of Object.keys(p[kind] ?? {})) {
      if (name.startsWith('@types/')) continue;
      if (!deps.has(name)) deps.set(name, new Set());
      deps.get(name).add(`${d}:${kind === 'dependencies' ? 'dep' : 'dev'}`);
    }
  }
}
for (const w of workspaceNames) deps.delete(w);

const query = `query($p:String!,$after:String){securityVulnerabilities(first:100,ecosystem:NPM,package:$p,after:$after){totalCount pageInfo{hasNextPage endCursor} nodes{advisory{ghsaId summary severity publishedAt withdrawnAt cwes(first:5){nodes{cweId name}}} vulnerableVersionRange firstPatchedVersion{identifier}}}}`;
const out = [];
let i = 0;
for (const [name, where] of [...deps.entries()].sort()) {
  i++;
  let after = null;
  for (;;) {
    const args = ['api', 'graphql', '-f', `query=${query}`, '-f', `p=${name}`];
    if (after) args.push('-F', `after=${after}`);
    let res;
    try {
      res = JSON.parse(execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    } catch (e) {
      process.stderr.write(`FAIL ${name}: ${String(e.message).slice(0, 120)}\n`);
      break;
    }
    const v = res.data?.securityVulnerabilities;
    if (!v) break;
    for (const n of v.nodes) {
      out.push({
        package: name,
        where: [...where],
        ghsaId: n.advisory.ghsaId,
        severity: n.advisory.severity,
        publishedAt: n.advisory.publishedAt.slice(0, 10),
        withdrawn: Boolean(n.advisory.withdrawnAt),
        duplicate: /^Duplicate Advisory/i.test(n.advisory.summary),
        cwes: n.advisory.cwes.nodes.map((c) => c.cweId),
        cweNames: n.advisory.cwes.nodes.map((c) => c.name),
        range: n.vulnerableVersionRange,
        fixed: n.firstPatchedVersion?.identifier ?? null,
        summary: n.advisory.summary,
      });
    }
    if (!v.pageInfo.hasNextPage) break;
    after = v.pageInfo.endCursor;
  }
  if (i % 25 === 0) process.stderr.write(`${i}/${deps.size} packages\n`);
}
writeFileSync(join(outDir, 'direct-deps.json'), JSON.stringify([...deps.entries()].map(([n, w]) => ({ name: n, where: [...w] })), null, 1));
writeFileSync(join(outDir, 'ghsa-direct.json'), JSON.stringify(out, null, 1));
const live = out.filter((a) => !a.withdrawn && !a.duplicate);
console.log(`packages: ${deps.size}; advisories: ${out.length}; after dropping withdrawn+duplicates: ${live.length}`);
const by = (key) => {
  const m = new Map();
  for (const a of live) for (const k of (Array.isArray(a[key]) ? (a[key].length ? a[key] : ['(none)']) : [a[key]])) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m.entries()].sort((x, y) => y[1] - x[1]);
};
console.log('\nby severity:', by('severity').map(([k, v]) => `${k}=${v}`).join(' '));
console.log('\ntop packages:');
for (const [k, v] of by('package').slice(0, 30)) console.log(`  ${String(v).padStart(3)}  ${k}`);
console.log('\ntop CWEs:');
const names = new Map(live.flatMap((a) => a.cwes.map((c, i) => [c, a.cweNames[i]])));
for (const [k, v] of by('cwes').slice(0, 45)) console.log(`  ${String(v).padStart(3)}  ${k}  ${names.get(k) ?? ''}`);
