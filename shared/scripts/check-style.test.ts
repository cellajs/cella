import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const scripts = dirname(fileURLToPath(import.meta.url));
const dash = '—';
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

function run(root: string, script: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [join(root, 'shared/scripts', script), ...args], {
    cwd: root,
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const lines = (...rows: string[]) => rows.map((row) => `${row}\n`).join('');

const dirty = makeRepo({
  'backend/src/rules.ts': [
    `// One ${dash} two`,
    `/** The ${term} holds, ${maybe}. */`,
    `export const a = 1; // the ${seam} and the ${bearing} part`,
    `// ${legacy} path`,
    `const k = '${name}_id';`,
  ].join('\n'),
  'backend/src/long.ts': ['// one', '// two', '// three', '// four', '', 'const x = 1;'].join('\n'),
  'infra/c.yaml': [`# ${bearing} in infra`, `# ${dash} still required`, 'key: value'].join('\n'),
  'shared/config/x.jsonc': ['{', `  // ${term}`, `  "k": "// not a comment ${dash}"`, '}'].join('\n'),
  'docs/guide.md': [`# Guide ${term}`, '', `Prose ${dash} and \`${dash}\`.`, `The ${bearing} ${seam}.`].join('\n'),
  'CHANGELOG.md': `${dash} ${bearing}\n`,
  'frontend/src/comp.tsx': 'export const Arrow = () => <div />;\n',
});

const clean = makeRepo({ 'backend/src/a.ts': '// A plain comment.\nexport const a = 1;\n', 'docs/a.md': '# Plain\n' });

afterAll(() => {
  for (const root of [dirty, clean]) rmSync(root, { recursive: true, force: true });
});

describe('comment check', () => {
  const required = [
    '  backend/src/rules.ts:1:1 [em-dash] split the sentence or remove the secondary clause',
    '  backend/src/rules.ts:2:1 [concrete-language] name the precise rule, constraint, guarantee, requirement, contract, precondition, or assumption',
    '  backend/src/rules.ts:2:1 [review-conversation] resolve the question or track it outside the source comment',
    `  backend/src/rules.ts:3:21 [${bearing}] name the dependency, requirement, or failure consequence directly`,
    '  infra/c.yaml:2:1 [em-dash] split the sentence or remove the secondary clause',
    '  shared/config/x.jsonc:2:3 [concrete-language] name the precise rule, constraint, guarantee, requirement, contract, precondition, or assumption',
  ];
  const review = [
    '  backend/src/rules.ts:3:21 [boundary-metaphor] consider boundary, interface, integration point, or the named call site',
    '  backend/src/rules.ts:4:1 [compatibility-language] confirm that this describes an active compatibility contract',
  ];
  const placement =
    '  backend/src/long.ts:1:1 [detached-long-comment] 4 prose lines; move shared context to a README or attach a concise local constraint to a declaration';

  it('reports required rules once per comment at its start', () => {
    expect(run(dirty, 'check-comment-style.ts')).toEqual({
      status: 1,
      stdout: '',
      stderr: lines('[comments:check] 6 violation(s):', ...required),
    });
  });

  it('adds review markers in audit mode', () => {
    expect(run(dirty, 'check-comment-style.ts', '--audit')).toEqual({
      status: 1,
      stdout: '',
      stderr: lines('[comments:check] 6 violation(s):', ...required, '[comments:audit] 2 review marker(s):', ...review),
    });
  });

  it('keeps the concrete-language rule and the required vocabulary in language mode', () => {
    expect(run(dirty, 'check-comment-style.ts', '--concrete-language')).toEqual({
      status: 1,
      stdout: '',
      stderr: lines('[comments:language] 3 violation(s):', required[1]!, required[3]!, required[5]!),
    });
  });

  it('reports detached long comments in placement mode, limited to the requested roots', () => {
    expect(run(dirty, 'check-comment-style.ts', '--placement', 'backend/src/long.ts')).toEqual({
      status: 1,
      stdout: '',
      stderr: lines('[comments:placement] 1 detached long comment(s):', placement),
    });
  });

  it('prints the mode summary when clean', () => {
    expect(run(clean, 'check-comment-style.ts', '--audit')).toEqual({
      status: 0,
      stdout: lines('[comments:audit] OK, 0 lower-confidence marker(s) require review.'),
      stderr: '',
    });
  });
});

describe('doc check', () => {
  it('reports every match at its position, the audit section included', () => {
    expect(run(dirty, 'check-doc-style.ts', '--audit')).toEqual({
      status: 1,
      stdout: '',
      stderr: lines(
        '[docs:style] 1 concrete-language violation(s):',
        `  docs/guide.md:1:9 replace "${term}" with a precise rule, constraint, guarantee, requirement, contract, precondition, or assumption`,
        '[docs:style] 1 em dash(es):',
        '  docs/guide.md:3:7 em dash (U+2014): split the sentence, use a colon, or drop the clause',
        '[docs:style] 2 required vocabulary replacement(s):',
        `  CHANGELOG.md:1:3 [${bearing}] "${bearing}": name the dependency, requirement, or failure consequence directly`,
        `  docs/guide.md:4:5 [${bearing}] "${bearing}": name the dependency, requirement, or failure consequence directly`,
        '[docs:style:audit] 1 review marker(s):',
        `  docs/guide.md:4:18 [boundary-metaphor] "${seam}": consider boundary, interface, integration point, or the named call site`,
      ),
    });
  });

  it('prints the audit header with no findings', () => {
    expect(run(clean, 'check-doc-style.ts', '--audit')).toEqual({
      status: 0,
      stdout: lines('[docs:style] OK, documentation uses concrete language.'),
      stderr: lines('[docs:style:audit] 0 review marker(s):'),
    });
  });
});

describe('app vocabulary and frontend checks', () => {
  it('reports the product name in app logic', () => {
    expect(run(dirty, 'check-app-vocabulary.ts')).toEqual({
      status: 1,
      stdout: '',
      stderr: lines(
        '[app-vocabulary] 1 disallowed occurrence(s):',
        `  backend/src/rules.ts:5:12 replace "${name}_i" derive from appConfig or use a neutral name; the product name is not an identifier or wire string`,
      ),
    });
  });

  it('reports arrow components', () => {
    expect(run(dirty, 'check-frontend-style.ts')).toEqual({
      status: 1,
      stdout: '',
      stderr: lines(
        '[frontend:style] 1 violation(s):',
        '  frontend/src/comp.tsx:1:14 [component-declaration] Arrow is an ordinary component; use a named function declaration',
      ),
    });
  });
});

describe('style check', () => {
  it('prints the detail of every failing area and names them', () => {
    const result = run(dirty, 'check-style.ts');
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.split('\n').filter((row) => row.startsWith('['))).toEqual([
      '[app-vocabulary] 1 disallowed occurrence(s):',
      '[docs:style] 1 concrete-language violation(s):',
      '[docs:style] 1 em dash(es):',
      '[docs:style] 2 required vocabulary replacement(s):',
      '[comments:check] 6 violation(s):',
      '[comments:placement] 1 detached long comment(s):',
      '[frontend:style] 1 violation(s):',
      '[style] 4 area(s) failed (terminology, documentation, comments, frontend).',
    ]);
  });

  it('collapses clean areas into one line', () => {
    expect(run(clean, 'check-style.ts')).toEqual({
      status: 0,
      stdout: lines('[style] OK, terminology, documentation, comments and frontend code follow the required style.'),
      stderr: '',
    });
  });
});

describe('entry points', () => {
  it('run when node starts them through a symlinked path', () => {
    const link = `${dirty}-link`;
    symlinkSync(dirty, link);
    try {
      const scripts = ['check-app-vocabulary.ts', 'check-doc-style.ts', 'check-comment-style.ts', 'check-doc-size.ts'];
      const statuses = [...scripts, 'check-frontend-style.ts'].map((script) => run(link, script).status);
      expect(statuses).toEqual([1, 1, 1, 1, 1]);
    } finally {
      rmSync(link);
    }
  });
});
