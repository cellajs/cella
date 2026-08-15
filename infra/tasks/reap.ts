// Thin loader for the deferred-reap command (the counterpart of a deploy run
// with --defer-reap). ESM hoists imports and the implementation's import graph
// evaluates the shared appConfig at load time, so APP_MODE must be in the
// environment BEFORE that graph loads. Parse the mode here with no app
// imports, then load the implementation dynamically.
const argv = process.argv.slice(2);
const modeIndex = argv.indexOf('--mode');
const mode = modeIndex >= 0 ? argv[modeIndex + 1] : undefined;
if (!mode) {
  console.error('Usage: reap.ts --mode <staging|production> --sha <git-sha>');
  process.exit(1);
}
process.env.APP_MODE = mode;

const { reapMain } = await import('./deploy-run');
await reapMain(argv).catch(async (err: unknown) => {
  const { failWithHint } = await import('../lib/utils/cli-output');
  failWithHint(err instanceof Error ? err.message : String(err), {
    command: 'pnpm --filter infra run reap --mode <mode> --sha <sha>',
    description: 'Re-running is safe (the update converges on promoted pointers). The next deploy also reaps:',
  });
});

export {};
