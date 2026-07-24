// Thin loader for the deploy command. ESM hoists imports, and the deploy
// implementation's import graph evaluates the shared appConfig at load time,
// so APP_MODE must be in the environment BEFORE that graph loads. Parse the
// mode here with no app imports, then load the implementation dynamically.
const argv = process.argv.slice(2)
const modeIndex = argv.indexOf('--mode')
const mode = modeIndex >= 0 ? argv[modeIndex + 1] : undefined
if (!mode) {
  console.error('Usage: deploy.ts --mode <staging|production> --sha <git-sha> [--dist <dir>] [--git-ref <ref>]')
  process.exit(1)
}
process.env.APP_MODE = mode

const { main } = await import('./deploy-run')
await main(argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})

export {}
