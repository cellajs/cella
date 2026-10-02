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

describe('tailwind classes', () => {
  const view = [
    "import { cva } from 'class-variance-authority';",
    "import { cn, tw } from './cn';",
    '',
    "const badge = cva('inline-flex bad-base', {",
    "  variants: { size: { sm: 'h-8 bad-variant', lg: ['h-10', 'bad-array'] } },",
    "  compoundVariants: [{ size: 'sm', class: 'bad-compound' }],",
    "  defaultVariants: { size: 'sm' },",
    '});',
    'const cardClass = tw`rounded bad-tagged`;',
    "const edges = ['top', 'bottom'];",
    '',
    'function rowClass(index: number) {',
    "  if (index === 0) return 'bad-return';",
    "  return edges.includes('top') ? 'p-1' : 'p-2';",
    '}',
    '',
    "export const meta = { argTypes: { className: { control: 'text' } }, args: { className: 'bad-arg' } };",
    '',
    "export function View({ open, size, className = 'bad-default' }: { open: boolean; size: string; className?: string }) {",
    '  return (',
    '    <div className="flex flew-row group/tile soft-text hover:soft-text plain-marker sm:plain-marker toggled in-[.selected]:block">',
    "      <p className={cn('p-2', { hidden: open, 'bad-key': size === 'not-a-class' }, open && 'bad-and', badge({ size: 'sm' }), className)} />",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the fixture line is TSX source holding a template literal
    "      <p className={`text-${size} px-2 ${open ? 'bad-nested' : ''} row-${open ? 'even' : 'odd'} ${cardClass} ${rowClass(1)}`} />",
    '      <span className="selected" />',
    '    </div>',
    '  );',
    '}',
    '',
    'export function toggle(element: HTMLElement) {',
    "  element.classList.toggle('toggled');",
    '}',
  ].join('\n');

  function tailwindRepo(stylesheet: string): string {
    const root = makeRepo({
      'frontend/package.json': '{ "name": "frontend", "private": true }\n',
      'frontend/src/styling/app.css': stylesheet,
      'frontend/src/view.tsx': view,
      'frontend/src/view.test.tsx': 'export const probe = <div className="made-up" />;\n',
    });
    symlinkSync(join(scripts, '../../frontend/node_modules'), join(root, 'frontend/node_modules'));
    return root;
  }

  const stylesheet = lines("@import 'tailwindcss';", '@utility soft-text {', '  color: red;', '}', '.plain-marker {', '  color: red;', '}');

  const deadMessage =
    'Tailwind compiles no CSS for it and no stylesheet or script selects it; fix the name, or list it under markerClasses in shared/config/vocabulary-allowlist.ts';
  const dead = (at: string, className: string) => `  frontend/src/view.tsx:${at} [tailwind-class] "${className}": ${deadMessage}`;

  it('reports class names that compile to no CSS and that no stylesheet, script or selector uses', () => {
    const root = tailwindRepo(stylesheet);
    try {
      expect(run(root)).toEqual({
        status: 1,
        stdout: '',
        stderr: lines(
          '[style] 13 finding(s):',
          dead('4:32', 'bad-base'),
          dead('5:32', 'bad-variant'),
          dead('5:60', 'bad-array'),
          dead('6:44', 'bad-compound'),
          dead('9:30', 'bad-tagged'),
          dead('13:28', 'bad-return'),
          dead('17:89', 'bad-arg'),
          dead('19:49', 'bad-default'),
          dead('21:26', 'flew-row'),
          '  frontend/src/view.tsx:21:85 [tailwind-class] "sm:plain-marker": plain-marker is a plain CSS class, so variants and ! do not apply to it; define it with @utility',
          dead('22:48', 'bad-key'),
          dead('22:93', 'bad-and'),
          dead('23:50', 'bad-nested'),
        ),
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports a stylesheet Tailwind cannot load on the entry file', () => {
    const root = tailwindRepo(`${stylesheet}.box {\n  @apply p-2 bad-apply;\n}\n`);
    try {
      expect(run(root, 'frontend/src/styling/app.css')).toEqual({
        status: 1,
        stdout: '',
        stderr: lines(
          '[style] 1 finding(s):',
          '  frontend/src/styling/app.css [tailwind-class] Tailwind cannot load this stylesheet: Cannot apply unknown utility class `bad-apply`',
        ),
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
