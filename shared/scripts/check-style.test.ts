import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const scripts = dirname(fileURLToPath(import.meta.url));
const dash = '\u2014';
const word = (...parts: string[]) => parts.join('');
const term = word('invar', 'iant');
const bearing = word('load', '-bearing');
const seam = word('se', 'am');
const maybe = word('may', 'be');
const legacy = word('leg', 'acy');
const name = word('cel', 'la');

/** A git repository holding `files` and a copy of the check scripts, which the repository ignores. */
function makeRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'style-checks-'));
  const all = { ...files, '.gitignore': 'node_modules\nshared/scripts/\n' };
  for (const [file, content] of Object.entries(all)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  mkdirSync(join(root, 'shared/scripts'), { recursive: true });
  for (const script of readdirSync(scripts).filter((file) => /(?<!\.test)\.ts$/.test(file))) {
    cpSync(join(scripts, script), join(root, 'shared/scripts', script));
  }
  symlinkSync(join(scripts, '../../node_modules'), join(root, 'node_modules'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  return root;
}

function run(root: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [join(root, 'shared/scripts/check-style.ts'), ...args], { cwd: root, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const lines = (...rows: string[]) => rows.map((row) => `${row}\n`).join('');

const dirty = makeRepo({
  'backend/src/rules.ts': [
    `// One ${dash} two ${dash} three`,
    `/** The ${term} holds, ${maybe}. */`,
    `export const a = 1; // the ${seam} and the ${bearing} part`,
    `// ${legacy} path`,
    `const k = '${name}_id';`,
  ].join('\n'),
  'backend/src/long.ts': ['// one', '// two', '// three', '// four', '', 'const x = 1;'].join('\n'),
  'infra/c.yaml': [
    `# ${bearing} in infra`,
    `# ${dash} still required`,
    `key: value # ${maybe} later`,
    'run: |',
    `  echo x # ${maybe} shell text`,
  ].join('\n'),
  'shared/config/x.jsonc': ['{', `  // ${term}`, `  "k": "// not a comment ${dash}"`, '}'].join('\n'),
  'docs/guide.md': [`# Guide ${term}`, '', `Prose ${dash} and \`${dash}\`.`, `The ${bearing} ${seam}.`].join('\n'),
  'CHANGELOG.md': `${dash} ${bearing} ${term}\n`,
  'cella/CHANGELOG.md': `${dash} ${bearing} ${term}\n`,
  'frontend/src/comp.tsx': [
    "import { useCount } from './store';",
    `export const Arrow = () => <div>{/* ${term} */}</div>;`,
    'export function Reader() {',
    '  return <div>{useCount().count}</div>;',
    '}',
  ].join('\n'),
  'frontend/src/store.ts': "import { create } from 'zustand';\nexport const useCount = create(() => ({ count: 0 }));\n",
});

const clean = makeRepo({ 'backend/src/a.ts': '// A plain comment.\nexport const a = 1;\n', 'docs/a.md': '# Plain\n' });

afterAll(() => {
  for (const root of [dirty, clean]) rmSync(root, { recursive: true, force: true });
});

const OK = '[style] OK, terminology, documentation, comments and frontend code follow the required style.';
const placement =
  '  backend/src/long.ts:1:1 [detached-long-comment] 4 prose lines; move shared context to a README or attach a concise local constraint to a declaration';
const storeRead = '  frontend/src/comp.tsx:4:16 [store-selector] useCount() subscribes to every field; select the values this component reads';
const required = [
  placement,
  `  backend/src/rules.ts:1:8 [em-dash] "${dash}": split the sentence, use a colon, or drop the clause`,
  `  backend/src/rules.ts:1:14 [em-dash] "${dash}": split the sentence, use a colon, or drop the clause`,
  `  backend/src/rules.ts:2:9 [concrete-language] "${term}": name the precise rule, constraint, guarantee, requirement, contract, precondition, or assumption`,
  `  backend/src/rules.ts:2:26 [review-conversation] "${maybe}": resolve the question or track it outside the source comment`,
  `  backend/src/rules.ts:3:41 [${bearing}] "${bearing}": name the dependency, requirement, or failure consequence directly`,
  `  backend/src/rules.ts:5:12 [product-name] "${name}_i": derive it from appConfig or use a neutral name; the product name is not an identifier or wire string`,
  `  docs/guide.md:1:9 [concrete-language] "${term}": name the precise rule, constraint, guarantee, requirement, contract, precondition, or assumption`,
  `  docs/guide.md:3:7 [em-dash] "${dash}": split the sentence, use a colon, or drop the clause`,
  `  docs/guide.md:4:5 [${bearing}] "${bearing}": name the dependency, requirement, or failure consequence directly`,
  '  frontend/src/comp.tsx:2:14 [component-declaration] Arrow is an ordinary component; use a named function declaration',
  storeRead,
  `  infra/c.yaml:2:3 [em-dash] "${dash}": split the sentence, use a colon, or drop the clause`,
  `  infra/c.yaml:3:14 [review-conversation] "${maybe}": resolve the question or track it outside the source comment`,
  `  shared/config/x.jsonc:2:6 [concrete-language] "${term}": name the precise rule, constraint, guarantee, requirement, contract, precondition, or assumption`,
];
const review = [
  `  backend/src/rules.ts:3:28 [boundary-metaphor] "${seam}": consider boundary, interface, integration point, or the named call site`,
  `  backend/src/rules.ts:4:4 [compatibility-language] "${legacy}": confirm that this describes an active compatibility contract`,
  `  docs/guide.md:4:18 [boundary-metaphor] "${seam}": consider boundary, interface, integration point, or the named call site`,
  `  frontend/src/comp.tsx:2:37 [concrete-language] "${term}": name the precise rule, constraint, guarantee, requirement, contract, precondition, or assumption`,
];

describe('style check', () => {
  it('reports every required finding in file order, changelogs and infra wording excluded', () => {
    expect(run(dirty)).toEqual({ status: 1, stdout: '', stderr: lines(`[style] ${required.length} finding(s):`, ...required) });
  });

  it('adds review markers in audit mode, comments only a token boundary reaches included', () => {
    expect(run(dirty, '--audit')).toEqual({
      status: 1,
      stdout: '',
      stderr: lines(`[style] ${required.length} finding(s):`, ...required, `[style:audit] ${review.length} review marker(s):`, ...review),
    });
  });

  it('limits the files checked to the requested paths and still knows every store', () => {
    expect(run(dirty, 'backend/src/long.ts', 'frontend/src/comp.tsx').stderr).toBe(
      lines(
        '[style] 3 finding(s):',
        placement,
        '  frontend/src/comp.tsx:2:14 [component-declaration] Arrow is an ordinary component; use a named function declaration',
        storeRead,
      ),
    );
  });

  it('prints one line when clean, and the audit header with no markers', () => {
    expect(run(clean, '--audit')).toEqual({ status: 0, stdout: lines(OK), stderr: lines('[style:audit] 0 review marker(s):') });
  });
});

describe('app-owned prose exclusions', () => {
  it('skip the listed path prefixes in comments and docs', () => {
    const root = makeRepo({
      'shared/config/vocabulary-allowlist.ts': "export const vocabularyAllowlist = { files: [], prefixes: [], proseExclude: ['reference/'] };\n",
      'reference/old.ts': `// ${dash}\n`,
      'reference/README.md': `${dash}\n`,
      'src/new.ts': `// ${dash}\n`,
    });
    try {
      expect(run(root).stderr).toBe(
        lines('[style] 1 finding(s):', `  src/new.ts:1:4 [em-dash] "${dash}": split the sentence, use a colon, or drop the clause`),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
