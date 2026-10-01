import type { Plugin } from 'vite';

/** Every component the React Compiler compiles imports its memo cache helper from here. */
const compilerRuntime = /[\\/]react[\\/]compiler-runtime\.js$/;

/**
 * Vite plugin: fails a production build when no module imports react/compiler-runtime, which means the React
 * Compiler compiled nothing. A babel `include` that matches no file disables the compiler without any other error.
 */
export const reactCompilerGuard = (): Plugin => ({
  name: 'react-compiler-guard',
  apply: 'build',

  generateBundle(_options, bundle) {
    const compiled = Object.values(bundle).some((output) => output.type === 'chunk' && output.moduleIds.some((id) => compilerRuntime.test(id)));
    if (compiled) return;
    this.error('React Compiler output is missing: no module imports react/compiler-runtime. Check the babel include in vite.config.ts.');
  },
});
