// Thin loader for the deploy command. ESM hoists imports, and the deploy
// implementation's import graph evaluates the shared appConfig at load time,
// so APP_MODE must be in the environment BEFORE that graph loads. Parse the
// mode here with no app imports, then load the implementation dynamically.
const argv = process.argv.slice(2);
const modeIndex = argv.indexOf('--mode');
const mode = modeIndex >= 0 ? argv[modeIndex + 1] : undefined;
if (!mode) {
  console.error('Usage: deploy.ts --mode <staging|production> --sha <git-sha> [--defer-reap]');
  process.exit(1);
}
process.env.APP_MODE = mode;

const { deployFailureHint, main } = await import('./deploy-run');
await main(argv).catch(async (err: unknown) => {
  const { failWithHint } = await import('../lib/utils/cli-output');
  const { ExitCodeError } = await import('../lib/utils/errors');
  // A deploy that stopped on an owed privileged change keeps the preflight's code, so the main job can tell blocked from failed.
  failWithHint(err instanceof Error ? err.message : String(err), deployFailureHint(err, mode), err instanceof ExitCodeError ? err.exitCode : 1);
});

export {};
