// Maps every advisory in data/advisories.json onto one vector class of classes.md beside this folder.
// Usage: node classify.mjs <security-review dir> [--list <classId>]
import { readFileSync, writeFileSync } from 'node:fs';

const [dir, flag, listId] = process.argv.slice(2);
const all = JSON.parse(readFileSync(`${dir}/data/advisories.json`, 'utf8')).filter((a) => !a.withdrawn && !a.duplicate);

const tooling = /^(vite|storybook|@storybook\/|vitest|@vitest\/|playwright|@vitejs\/|@faker-js\/|@hey-api\/|@tanstack\/router-(generator|plugin)|@rolldown\/|@biomejs\/|knip|tsx|typescript|@mdx-js\/rollup|rollup-plugin-visualizer|@storybook)/;
// Library features this repo does not mount; the advisory is filed, and a pattern lesson may still be assigned by hand.
const unused = /serveStatic|serve-static|toSSG|Lambda|Cloudflare|Deno|Bun\b|hono\/jsx|\bJSX\b|\bSSR\b|memo\(\)|Proxy Helper|Language Middleware|CORS Middleware|API Gateway|TrieRouter|ErrorBoundary|cx\(\) Utility|Named path parameters/;
const lesson = [
  [/JWT Middleware|JWK Auth|NumericDate/, 'A5'],
  [/Cache Middleware|cache middleware/, 'C8'],
  [/conninfo|IP Spoofing/, 'A6'],
  [/CORS Middleware/, 'C7'],
];
const byPackage = [
  [/^(dompurify|sanitize-html|maplibre-gl|jspdf|react-pdf|react|react-dom|i18next)$/, () => 'C4'],
  [/^(pg|drizzle-orm)$/, () => 'C3'],
  [/^ws$/, (a) => (a.cwes.some((c) => /^CWE-(400|770|476|1050|345)$/.test(c)) ? 'C1' : 'B5')],
  [/^jose$/, (a) => (a.cwes.some((c) => /^CWE-(400|834)$/.test(c)) ? 'C1' : 'A5')],
  [/^nanoid$/, () => 'A1'],
  [/^zod$/, () => 'C1'],
  [/^(dexie|immer)$/, () => 'C2'],
  [/^yaml$/, (a) => (a.cwes.includes('CWE-248') ? 'E3' : 'C1')],
  [/^i18next-http-backend$/, (a) => (a.cwes.includes('CWE-918') ? 'C5' : 'C4')],
  [/^@simplewebauthn\//, () => 'A3'],
  [/^@opentelemetry\//, (a) => (a.cwes.includes('CWE-532') ? 'D1' : a.cwes.includes('CWE-770') ? 'C1' : 'F1')],
  [/^@hono\/node-server$/, (a) => (a.cwes.includes('CWE-755') ? 'E3' : a.cwes.some((c) => /^CWE-(401|770)$/.test(c)) ? 'C1' : 'C7')],
];
const byCwe = [
  [/^CWE-(79|80|116|94|95|96|74)$/, 'C4'],
  [/^CWE-89$/, 'C3'],
  [/^CWE-(22|23|35|73)$/, 'C6'],
  [/^CWE-(400|770|1333|407|834|835|674|1050|401)$/, 'C1'],
  [/^CWE-(1321|915|471|1285)$/, 'C2'],
  [/^CWE-918$/, 'C5'],
  [/^CWE-(185|1289|180|290|350)$/, 'A6'],
  [/^CWE-(347|1284)$/, 'A5'],
  [/^CWE-(352|444|174|50|706|348|942|113)$/, 'C7'],
  [/^CWE-(613|294|640|384|1004|614)$/, 'A2'],
  [/^CWE-(295|296|287|308)$/, 'A3'],
  [/^CWE-601$/, 'A4'],
  [/^CWE-(284|862|863|639)$/, 'B1'],
  [/^CWE-(269|285)$/, 'B2'],
  [/^CWE-(200|201|538|541|532|522|908)$/, 'D1'],
  [/^CWE-(203|208|696)$/, 'D2'],
  [/^CWE-(524|488|362)$/, 'C8'],
  [/^CWE-(1385|346)$/, 'B5'],
  [/^CWE-441$/, 'B6'],
  [/^CWE-(248|755|476)$/, 'E3'],
  [/^CWE-506$/, 'F1'],
];

const classify = (a) => {
  if (a.cwes.includes('CWE-506')) return { id: 'F1', applies: 'code' };
  if (a.package === 'playwright' && a.cwes.includes('CWE-347')) return { id: 'F1', applies: 'code' };
  if (tooling.test(a.package)) return { id: 'F2', applies: 'code' };
  if (unused.test(a.summary)) {
    const l = lesson.find(([re]) => re.test(a.summary));
    return l ? { id: l[1], applies: 'pattern' } : { id: 'n/a', applies: 'unused' };
  }
  if (/cookie/i.test(a.summary) && /^hono$/.test(a.package)) return { id: 'A2', applies: 'code' };
  if (/SSE|writeSSE/.test(a.summary)) return { id: 'B4', applies: 'code' };
  if (/app\.mount|mount prefix/.test(a.summary)) return { id: 'C7', applies: 'code' };
  for (const [re, fn] of byPackage) if (re.test(a.package)) return { id: fn(a), applies: 'code' };
  for (const c of a.cwes) for (const [re, id] of byCwe) if (re.test(c)) return { id, applies: 'code' };
  return { id: '?', applies: 'unclassified' };
};

const rows = all.map((a) => ({ ...a, ...classify(a) }));
writeFileSync(`${dir}/data/classified.json`, JSON.stringify(rows, null, 1));
if (flag === '--list') {
  for (const r of rows.filter((r) => r.id === listId)) console.log(`${r.applies[0]} ${r.severity[0]} ${r.publishedAt.slice(0, 4)} ${r.package.padEnd(24)} ${r.ghsaId} ${(r.cwes.join('/') || '-').padEnd(14)} ${r.summary.slice(0, 95)}`);
  process.exit(0);
}
const counts = new Map();
for (const r of rows) {
  const k = r.id;
  if (!counts.has(k)) counts.set(k, { code: 0, pattern: 0, packages: new Set(), sev: { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0 } });
  const c = counts.get(k);
  c[r.applies === 'pattern' ? 'pattern' : 'code']++;
  c.packages.add(r.package);
  c.sev[r.severity]++;
}
const order = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'D1', 'D2', 'D3', 'E1', 'E2', 'E3', 'F1', 'F2', 'F3', 'n/a', '?'];
console.log('class  code  pattern  C/H/M/L        packages');
for (const id of order) {
  const c = counts.get(id);
  if (!c) { console.log(`${id.padEnd(6)} ${'0'.padStart(4)}`); continue; }
  console.log(`${id.padEnd(6)} ${String(c.code).padStart(4)}  ${String(c.pattern).padStart(7)}  ${`${c.sev.CRITICAL}/${c.sev.HIGH}/${c.sev.MODERATE}/${c.sev.LOW}`.padEnd(14)} ${[...c.packages].join(', ')}`);
}
console.log('\nunclassified:');
for (const r of rows.filter((r) => r.id === '?')) console.log(`  ${r.package} ${r.ghsaId} ${r.cwes.join('/')} ${r.summary.slice(0, 90)}`);
