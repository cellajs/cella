import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Logger } from 'babel-plugin-react-compiler';
import type { Plugin } from 'vite';

/** Every component the React Compiler compiles imports its memo cache helper from here. */
const compilerRuntime = /[\\/]react[\\/]compiler-runtime\.js$/;

const frontendDir = path.resolve(import.meta.dirname, '..');

/** The template's list, synced to every app, then the app's own list for files the sync never updates (may be absent). */
const allowlistFiles = ['react-compiler-allowlist.json', 'react-compiler-allowlist.app.json'];

interface Bailout {
  /** Line of the skipped function; null for an error outside any function. */
  line: number | null;
  /** Each reason the compiler gave, with the source lines it points at. */
  reasons: Map<string, Set<number>>;
}

/** Functions the compiler skipped in this process, by file (relative to `frontend/`) and function name. */
const bailouts = new Map<string, Map<string, Bailout>>();

/** Files the compiler reported on: an entry whose file is among them and that no longer bails compiles now. */
const compiledFiles = new Set<string>();

/** The name a function is declared under: `function Name`, or `const Name =` before an arrow or a `memo(` wrapper. */
function functionName(source: string, { line, column }: { line: number; column: number }) {
  const text = source.split('\n')[line - 1] ?? '';
  const declared = /^(?:async\s+)?function\s*\*?\s*([\w$]+)/.exec(text.slice(column));
  const assigned = /(?:const|let|var)\s+([\w$]+)\s*(?::[^=]*)?=\s*(?:[\w$.]+(?:<[^>]*>)?\(\s*)*(?:async\s*)?$/.exec(text.slice(0, column));
  return declared?.[1] ?? assigned?.[1] ?? `line ${line}`;
}

/** Passed to `reactCompilerPreset({ logger })`: records every function the compiler refused or crashed on. */
export const reactCompilerLogger: Logger = {
  logEvent(filename, event) {
    if (!filename) return;
    const file = path.relative(frontendDir, filename).split(path.sep).join('/');
    compiledFiles.add(file);
    if (event.kind !== 'CompileError' && event.kind !== 'PipelineError') return;

    const start: { line: number; column: number } | undefined = event.fnLoc?.start;
    const name = start ? functionName(readFileSync(filename, 'utf8'), start) : '<module>';
    const byName = bailouts.get(file) ?? new Map<string, Bailout>();
    const bailout = byName.get(name) ?? { line: start?.line ?? null, reasons: new Map() };
    bailouts.set(file, byName.set(name, bailout));

    const loc = event.kind === 'CompileError' ? event.detail.primaryLocation() : null;
    const reason = event.kind === 'CompileError' ? `${event.detail.category}: ${event.detail.reason}` : `PipelineError: ${event.data.split('\n')[0]}`;
    const lines = bailout.reasons.get(reason) ?? new Set();
    if (loc && typeof loc !== 'symbol') lines.add(loc.start.line);
    bailout.reasons.set(reason, lines);
  },
};

const describeBailout = (key: string, { line, reasons }: Bailout) => {
  const why = [...reasons].map(([reason, lines]) => (lines.size ? `${reason} (line ${[...lines].join(', ')})` : reason));
  return `${key}${line ? ` (line ${line})` : ''}: ${why.join('; ')}`;
};

const howToResolve =
  'Fix it, or add "<file>:<function>": "<why it stays>" to frontend/vite/react-compiler-allowlist.app.json for a file the app owns, or to react-compiler-allowlist.json beside it for a template file (frontend/vite/README.md).';

/**
 * Vite plugin, beside `reactCompilerLogger`: a production build fails on a function the React Compiler skipped that no
 * allowlist names, and when no module imports react/compiler-runtime (a babel `include` that matches no file disables
 * the compiler without any other error). The dev server warns once per skipped file. An entry that compiles now warns,
 * so a fix upstream never breaks an app's build.
 */
export const reactCompilerGuard = (): Plugin => {
  const allowlists = allowlistFiles.map((name) => {
    const file = path.join(import.meta.dirname, name);
    const entries: Record<string, string> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    return { name, entries };
  });
  const listed = (key: string) => allowlists.some(({ entries }) => key in entries);
  const unlisted = (file: string) =>
    [...(bailouts.get(file) ?? [])].map(([name, bailout]) => [`${file}:${name}`, bailout] as const).filter(([key]) => !listed(key));
  const warned = new Set<string>();
  let serving = false;

  return {
    name: 'react-compiler-guard',

    configResolved(config) {
      serving = config.command === 'serve';
    },

    // Runs after the babel plugin (enforce: 'pre'), so the compiler has reported on this module
    transform(_code, id) {
      if (!serving) return;
      const file = path.relative(frontendDir, id.split('?')[0]).split(path.sep).join('/');
      const skipped = unlisted(file);
      // A re-transform reports the file afresh
      bailouts.delete(file);
      if (!skipped.length || warned.has(file)) return;
      warned.add(file);
      this.warn(
        `React Compiler skips ${skipped.map(([key, bailout]) => describeBailout(key, bailout)).join('\n  ')}\nA production build that includes it fails. ${howToResolve}`,
      );
    },

    generateBundle(_options, bundle) {
      const compiled = Object.values(bundle).some((output) => output.type === 'chunk' && output.moduleIds.some((id) => compilerRuntime.test(id)));
      if (!compiled)
        this.error('React Compiler output is missing: no module imports react/compiler-runtime. Check the babel include in vite.config.ts.');

      for (const { name, entries } of allowlists) {
        for (const key of Object.keys(entries)) {
          const at = key.lastIndexOf(':');
          const file = key.slice(0, at);
          if (compiledFiles.has(file) && !bailouts.get(file)?.has(key.slice(at + 1)))
            this.warn(`React Compiler compiles ${key} now: remove it from frontend/vite/${name}.`);
        }
      }

      const skipped = [...bailouts.keys()].flatMap(unlisted);
      if (!skipped.length) return;
      const list = skipped.map(([key, bailout]) => `  ${describeBailout(key, bailout)}`).join('\n');
      this.error(
        `React Compiler skipped ${skipped.length} function(s) that no allowlist names, so they run without memoization:\n${list}\n${howToResolve}`,
      );
    },
  };
};
