/**
 * Builds the boot agent as a self-contained Node Single Executable Application
 * (SEA) — a single binary with no runtime Node/npm dependency on the VM image.
 *
 * Pipeline:
 *   1. Bundle agent/src/sea-entry.ts to one CommonJS file (SEA requires CJS).
 *   2. Generate the SEA prep blob with the LOCAL node (`--experimental-sea-config`).
 *      The blob is platform-independent (no snapshot / code cache), so it can be
 *      injected into a Linux binary from any host.
 *   3. Fetch the matching node-<version>-linux-x64 base binary (cached) — the VM
 *      target is Linux x86_64, regardless of the operator's host OS/arch.
 *   4. Copy the base binary and inject the blob with postject → cella-boot-agent.
 *
 * The Packer image only needs to `install` the resulting binary; the bake's smoke
 * tests (`cella-boot-agent --version` / `supports`) validate it natively on Linux.
 *
 * Run via `pnpm --filter infra agent:build`.
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Fuse sentinel string postject searches for in the binary; this is the constant
// value Node documents for SEA injection. Must match across generate + inject.
const SENTINEL = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'

const agentDir = dirname(fileURLToPath(import.meta.url))
const infraDir = resolve(agentDir, '..')
const distDir = join(agentDir, 'dist')
const cacheDir = join(agentDir, '.sea-cache')
const entrySrc = join(agentDir, 'src', 'sea-entry.ts')
const bundle = join(distDir, 'sea-entry.cjs')
const blob = join(distDir, 'sea-prep.blob')
const seaConfig = join(distDir, 'sea-config.json')
const outBin = join(distDir, 'cella-boot-agent')

function run(command: string, args: string[], cwd?: string): void {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (exit ${result.status ?? 'signal'})`)
}

rmSync(distDir, { recursive: true, force: true })
mkdirSync(distDir, { recursive: true })

// 1. Bundle the SEA entry to a single CJS file (esbuild emits .cjs in this ESM package).
run('tsup', [entrySrc, '--format', 'cjs', '--platform', 'node', '--target', 'node24', '--out-dir', distDir], infraDir)

// 2. Generate the SEA prep blob with the local node runtime.
writeFileSync(seaConfig, JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true }))
run(process.execPath, ['--experimental-sea-config', seaConfig])

// 3. Fetch the Linux x86_64 node base binary matching the local version (cached between bakes).
const version = process.version
const baseName = `node-${version}-linux-x64`
const baseBin = join(cacheDir, baseName, 'bin', 'node')
if (!existsSync(baseBin)) {
  mkdirSync(cacheDir, { recursive: true })
  const tarball = join(cacheDir, `${baseName}.tar.xz`)
  run('curl', ['-fsSL', '-o', tarball, `https://nodejs.org/dist/${version}/${baseName}.tar.xz`])
  run('tar', ['-xJf', tarball, '-C', cacheDir])
}

// 4. Copy the base binary and inject the blob → self-contained executable.
copyFileSync(baseBin, outBin)
chmodSync(outBin, 0o755)
const { inject } = await import('postject')
// postject's wasm objcopy prints benign "Can't find string offset for section
// name '.note…'" lines to stderr while rewriting the ELF — filter just those.
const noteWarning = /Can't find string offset for section name/
const originalWrite = process.stderr.write.bind(process.stderr)
process.stderr.write = ((chunk: string | Uint8Array, ...rest: unknown[]): boolean => {
  if (noteWarning.test(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString())) return true
  return (originalWrite as (c: string | Uint8Array, ...a: unknown[]) => boolean)(chunk, ...rest)
}) as typeof process.stderr.write
try {
  await inject(outBin, 'NODE_SEA_BLOB', readFileSync(blob), { sentinelFuse: SENTINEL })
} finally {
  process.stderr.write = originalWrite
}

// Leave only the final binary in dist/ for the Packer file provisioner.
for (const intermediate of [bundle, `${bundle}.map`, blob, seaConfig]) rmSync(intermediate, { force: true })

console.info(`Built self-contained boot agent: ${outBin} (base ${baseName})`)
