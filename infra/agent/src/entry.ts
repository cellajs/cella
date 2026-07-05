// Process entry point for the boot agent — the single CLI entry, bundled to CJS
// for the agent container image and used directly in local dev
// (`tsx agent/src/entry.ts`).
//
// process.argv mirrors a normal `node script.js <args>` launch: argv[0] and
// argv[1] are the executable + script paths and user arguments start at index 2,
// so we slice(2) here, identical to main.ts's own default.
//
// main.ts is a pure library (no self-exec), so bundling this entry to CJS pulls
// in no `import.meta`.
import { errorMessage } from '../../lib/errors'
import { main } from './main'

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(errorMessage(err))
    process.exit(1)
  })
