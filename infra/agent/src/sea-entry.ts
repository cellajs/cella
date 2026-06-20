// Entry point used ONLY by the Single Executable Application (SEA) build.
//
// In a SEA there is no script path in process.argv: argv[0] is the executable
// and the first user argument is argv[1] — one slot earlier than a normal
// `node script.js <args>` invocation. So we slice(1) here. main.ts keeps its
// own slice(2) default, which is correct for normal node execution and tests.
//
// main.ts also has a `import.meta.url === process.argv[1]` self-exec guard; in
// a SEA that comparison is always false, so main() never double-runs.
import { main } from './main'

main(process.argv.slice(1))
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
