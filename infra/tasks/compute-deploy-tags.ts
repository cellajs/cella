/**
 * Compute content-addressed deploy tags per service from the git work tree.
 *
 * The deploy pipeline used to tag every image with the commit SHA, so a
 * frontend-only commit still produced a brand-new tag for backend/cdc/yjs and
 * rolled their VMs even though nothing in those images changed. Here we instead
 * derive each service's tag from a SHA-256 of the git object ids of exactly the
 * paths that land in its image. The tag therefore changes if the image content
 * changes — so the on-VM reconciler (which no-ops when the published tag equals
 * the running one) skips the roll for untouched services, and an identical
 * rebuild is a true no-op everywhere.
 *
 * The commit SHA is kept around separately by the workflow (pushed as a second
 * image tag and baked as RELEASE_COMMIT / surfaced on /health as X-App-Commit);
 * it just no longer drives the deploy identity.
 *
 * `ai` is intentionally absent: it ships no image of its own (it reuses the
 * backend image), so its deploy tag is the backend tag — the workflow wires
 * that up from `service_tags.backend`.
 *
 * ## How inputs are declared (and why it doesn't drift)
 *
 * Listing every input path per service by hand duplicates the shared deps
 * (`shared`, `sdk`, `locales`) across each consumer and silently rots when a
 * dependency is added. Instead — mirroring how Nx/Turborepo hash a project plus
 * its dependency graph — each artifact declares only:
 *   - `packages`: the workspace package(s) it's built from. Their transitive
 *     `workspace:*` dependency directories are folded in automatically from the
 *     repo's package.json files, so a new shared dep needs no edit here.
 *   - `extraPaths`: non-package inputs the package graph can't know about — the
 *     Dockerfile, the root workspace manifests + `patches/`, and data dirs like
 *     `json/` that are imported via the `#json/*` alias rather than a package.
 *
 * Over-inclusion is safe (it only triggers an extra, correct roll); UNDER-
 * inclusion ships a stale image. The accompanying test parses the real
 * Dockerfiles and asserts every build-context COPY is covered, turning any
 * future drift into a red build.
 *
 * Usage (emits `key=value` lines for `>> $GITHUB_OUTPUT`):
 *   tsx infra/tasks/compute-deploy-tags.ts
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Repo root, relative to this file at `infra/tasks/`. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** Root workspace files + patches dir that every node image build COPYs. */
const WORKSPACE_BUILD_FILES = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'patches']

/**
 * What each deployable artifact is built from. `packages` are workspace package
 * names whose transitive `workspace:*` dependency dirs are added automatically;
 * `extraPaths` are repo paths the package graph can't infer.
 */
export interface ArtifactInputs {
  packages: string[]
  extraPaths: string[]
}

/** Image-building services (the SPA bundle is tracked separately, below). */
export const SERVICE_DEFS: Record<string, ArtifactInputs> = {
  // backend: built from the backend package; closure adds shared/sdk/locales.
  // json/ is imported via the `#json/*` alias (not a package), so it's explicit.
  backend: { packages: ['backend'], extraPaths: ['backend/Dockerfile', 'json', ...WORKSPACE_BUILD_FILES] },
  // cdc bundles backend/src at build time (an undeclared, source-level dep), so
  // we list `backend` explicitly — its closure also pulls in locales/sdk/shared.
  cdc: { packages: ['cdc', 'backend'], extraPaths: ['cdc/Dockerfile', ...WORKSPACE_BUILD_FILES] },
  yjs: { packages: ['yjs'], extraPaths: ['yjs/Dockerfile', ...WORKSPACE_BUILD_FILES] },
  // The `frontend` image is the Caddy reverse-proxy, NOT the SPA: its only input
  // is the Caddyfile under infra/caddy (a subdir of the infra package, not a
  // package itself), so there is no graph to expand. The SPA bundle is tracked
  // separately by FRONTEND_BUNDLE_DEF and goes to S3, not this image.
  frontend: { packages: [], extraPaths: ['infra/caddy/Dockerfile', 'infra/caddy'] },
}

/**
 * The static SPA bundle uploaded to the frontend bucket (not an image). Built
 * from the frontend package (closure adds shared/sdk/locales); json/ is consumed
 * via `#json/*` imports. The workflow compares this tag against an S3 marker to
 * skip an unchanged bundle's rebuild / upload / publish / edge-purge.
 */
export const FRONTEND_BUNDLE_DEF: ArtifactInputs = {
  packages: ['frontend'],
  extraPaths: ['json', ...WORKSPACE_BUILD_FILES],
}

/** Workspace dependency graph: package name → dir, and name → workspace dep names. */
export interface WorkspaceGraph {
  dirOf: Record<string, string>
  depsOf: Record<string, string[]>
}

/**
 * Read the workspace graph from package.json files. Scans top-level dirs (where
 * every package relevant to an image lives) for a `name` and its `workspace:*`
 * dependencies. Injectable root keeps it unit-testable.
 */
export function readWorkspaceGraph(root: string = REPO_ROOT): WorkspaceGraph {
  const dirOf: Record<string, string> = {}
  const rawDeps: Record<string, Record<string, string>> = {}
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const pkgPath = resolve(root, entry.name, 'package.json')
    if (!existsSync(pkgPath)) continue
    let pkg: { name?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string>; peerDependencies?: Record<string, string> }
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    } catch {
      continue // not valid JSON — skip
    }
    if (!pkg.name) continue
    dirOf[pkg.name] = entry.name
    rawDeps[pkg.name] = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }
  }
  const depsOf: Record<string, string[]> = {}
  for (const [name, deps] of Object.entries(rawDeps)) {
    depsOf[name] = Object.entries(deps)
      .filter(([dep, spec]) => typeof spec === 'string' && spec.startsWith('workspace:') && dirOf[dep])
      .map(([dep]) => dep)
  }
  return { dirOf, depsOf }
}

/** Transitive `workspace:*` closure of `names`, mapped to repo-relative dirs. */
export function packageDirsClosure(names: string[], graph: WorkspaceGraph): string[] {
  const seen = new Set<string>()
  const stack = [...names]
  while (stack.length > 0) {
    const name = stack.pop()
    if (name === undefined || seen.has(name)) continue
    seen.add(name)
    for (const dep of graph.depsOf[name] ?? []) stack.push(dep)
  }
  return [...seen].map((name) => graph.dirOf[name] ?? name)
}

/** Expand an artifact definition into its full, de-duplicated input path set. */
export function expandInputs(def: ArtifactInputs, graph: WorkspaceGraph): string[] {
  return [...new Set([...packageDirsClosure(def.packages, graph), ...def.extraPaths])]
}

// Resolve the declarations against the real workspace once at module load.
const graph = readWorkspaceGraph()

/**
 * Per-service image inputs — repo-root-relative paths whose content determines
 * the built image. Derived from SERVICE_DEFS + the workspace dependency graph.
 */
export const SERVICE_INPUTS: Record<string, string[]> = Object.fromEntries(
  Object.entries(SERVICE_DEFS).map(([service, def]) => [service, expandInputs(def, graph)]),
)

/** Inputs for the static SPA bundle (see FRONTEND_BUNDLE_DEF). */
export const FRONTEND_BUNDLE_INPUTS = expandInputs(FRONTEND_BUNDLE_DEF, graph)

/** Resolves a repo-root-relative path to a stable content id. Injectable for tests. */
export type ResolveObjectId = (path: string) => string

/**
 * Default resolver: the git object id of `<path>` at HEAD (`git rev-parse
 * HEAD:<path>`). For a directory this is the recursive tree hash, for a file
 * the blob hash — both change iff the content changes. Works with a shallow
 * (depth-1) checkout because the full HEAD tree is present.
 */
export const gitObjectId: ResolveObjectId = (path) => {
  const ref = `HEAD:${path}`
  const { status, stdout, stderr } = spawnSync('git', ['rev-parse', ref], { encoding: 'utf-8' })
  if (status !== 0 || !stdout.trim()) {
    throw new Error(`git rev-parse ${ref} failed: ${(stderr || '').trim() || `status ${status}`}`)
  }
  return stdout.trim()
}

/**
 * Combine a service's input object ids into a stable, short content tag. Inputs
 * are sorted so array order never affects the result; the path name is hashed
 * alongside its id so adding/removing/renaming an input busts the tag too. The
 * service name is mixed in so two services with identical inputs still get
 * distinct tags. 16 hex chars (64 bits) is ample to avoid collisions here.
 */
export function combineTag(service: string, inputs: string[], resolve: ResolveObjectId): string {
  const hash = createHash('sha256')
  hash.update(service)
  for (const path of [...inputs].sort()) {
    hash.update(`\n${path}=${resolve(path)}`)
  }
  return hash.digest('hex').slice(0, 16)
}

export interface DeployTags {
  serviceTags: Record<string, string>
  frontendBundleTag: string
}

/** Compute every service image tag plus the SPA bundle tag. */
export function computeDeployTags(resolve: ResolveObjectId = gitObjectId): DeployTags {
  const serviceTags: Record<string, string> = {}
  for (const [service, inputs] of Object.entries(SERVICE_INPUTS)) {
    serviceTags[service] = combineTag(service, inputs, resolve)
  }
  return { serviceTags, frontendBundleTag: combineTag('frontend-bundle', FRONTEND_BUNDLE_INPUTS, resolve) }
}

export function main(): void {
  const { serviceTags, frontendBundleTag } = computeDeployTags()
  // Compact JSON object consumed by the matrix-building jq step.
  console.info(`service_tags=${JSON.stringify(serviceTags)}`)
  // Individual tags for the inline backend matrix, ai-reuse wiring, and smoke.
  for (const [service, tag] of Object.entries(serviceTags)) {
    console.info(`${service}_tag=${tag}`)
  }
  console.info(`frontend_bundle_tag=${frontendBundleTag}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
