// Re-queries the packages a previous intake failed on and merges them into ghsa-direct.json.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const [dataDir, ...names] = process.argv.slice(2);
const file = `${dataDir}/ghsa-direct.json`;
const out = JSON.parse(readFileSync(file, 'utf8'));
const deps = new Map(JSON.parse(readFileSync(`${dataDir}/direct-deps.json`, 'utf8')).map((d) => [d.name, d.where]));
const query = `query($p:String!){securityVulnerabilities(first:100,ecosystem:NPM,package:$p){totalCount nodes{advisory{ghsaId summary severity publishedAt withdrawnAt cwes(first:5){nodes{cweId name}}} vulnerableVersionRange firstPatchedVersion{identifier}}}}`;
for (const name of names) {
  const res = JSON.parse(execFileSync('gh', ['api', 'graphql', '-f', `query=${query}`, '-f', `p=${name}`], { encoding: 'utf8' }));
  const v = res.data.securityVulnerabilities;
  console.log(`${name}: ${v.totalCount}`);
  for (const n of v.nodes) out.push({ package: name, where: deps.get(name) ?? [], ghsaId: n.advisory.ghsaId, severity: n.advisory.severity, publishedAt: n.advisory.publishedAt.slice(0, 10), withdrawn: Boolean(n.advisory.withdrawnAt), duplicate: /^Duplicate Advisory/i.test(n.advisory.summary), cwes: n.advisory.cwes.nodes.map((c) => c.cweId), cweNames: n.advisory.cwes.nodes.map((c) => c.name), range: n.vulnerableVersionRange, fixed: n.firstPatchedVersion?.identifier ?? null, summary: n.advisory.summary });
}
writeFileSync(file, JSON.stringify(out, null, 1));
console.log('total now', out.length);
