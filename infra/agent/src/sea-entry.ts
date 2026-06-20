// Process entry point for the boot agent — the single CLI entry for both the
// Single Executable Application (SEA) and local dev (`tsx agent/src/sea-entry.ts`).
//
// In a current Node SEA (verified on node-v24.5.0), process.argv mirrors a
// normal `node script.js <args>` launch: argv[0] and argv[1] are both the
// executable path and the user arguments start at index 2. So we slice(2) here,
// identical to main.ts's own default, and the same entry works under SEA and
// tsx/node. (Earlier experimental SEA builds put the first user arg at index 1;
// a stale slice(1) made `--version` resolve to the executable path and fall
// through to usage(), failing the image bake smoke test.)
//
// main.ts is a pure library (no self-exec), so bundling this entry to CJS pulls
// in no `import.meta` — keeping the SEA build warning-free.
import { main } from './main'

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
