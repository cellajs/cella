# File-based routing migration plan

Migrate the frontend from code-based TanStack Router routing to plain file-based routing (flavor: directories at layout boundaries, dot-notation leaves). Goals, in order of priority:

1. **Reduce cella↔fork sync friction** — eliminate the pinned `route-tree.tsx` composition file; forks extend by adding route files instead of editing shared ones.
2. **Move route logic and render components into modules** — route files become thin shims; `beforeLoad` logic and components live in `modules/`, where forks already own divergence.
3. **Unlock TanStack Start adoption** — Start (SPA mode, selective SSR, static prerendering) requires the generated file-based route tree.

Scope: cella only. Raak migrates separately afterwards, following the fork guidance at the bottom. Migration cost is acceptable: prerelease, single fork.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Flavor | Plain file-based (no virtual routes) | Start-compatible, zero extra abstraction |
| Naming | Directories at layout boundaries, dots for leaf segments | Layout dirs are discoverable fork extension points; dots keep leaves flat |
| Code splitting | `autoCodeSplitting: true` (no `.lazy.tsx` files) | Replaces manual `lazy()` wrappers in base-routes.ts |
| `routeTree.gen.ts` | Committed, biome-ignored, sync-ignored | Typecheck/CI works without a pre-generation step; each repo generates its own |
| Auth layout | Convert from pathless (`authLayout` id) to path-based `/auth` directory | Children already all start with `/auth/`; URLs unchanged, simpler files |
| Route logic | Extracted to `modules/<module>/route-logic.ts` where non-trivial | Divergence lands in fork-owned module files |
| Route components | Moved from `routes/*-components.tsx` to their modules | Same reason; `routes/` becomes a path manifest |

## Target file structure

URLs do not change. Route **IDs** change (see consumer updates below).

```
frontend/src/routes/
├── __root.tsx                            RootRoute (isAuth enforcement, error/notFound)
├── _public/
│   ├── route.tsx                         PublicLayoutRoute (pathless)
│   ├── about.tsx
│   ├── contact.tsx
│   ├── legal.index.tsx
│   ├── legal.$subject.tsx
│   ├── accessibility.tsx
│   ├── error.tsx                         ErrorNoticeRoute
│   ├── sign-out.tsx
│   ├── auth/
│   │   ├── route.tsx                     AuthLayoutRoute (path /auth + layout)
│   │   ├── authenticate.tsx
│   │   ├── mfa.tsx
│   │   ├── email-verification.$reason.tsx
│   │   ├── unsubscribed.tsx
│   │   └── error.tsx
│   └── _content/
│       ├── route.tsx                     PublicContentLayoutRoute (public SSE stream)
│       └── docs/
│           ├── route.tsx                 DocsLayoutRoute
│           ├── operations.tsx
│           ├── operations.table.tsx
│           ├── overview.tsx
│           ├── schemas.tsx
│           ├── pages.tsx
│           ├── page.$id.tsx
│           └── page.$id.edit.tsx
├── _app/
│   ├── route.tsx                         AppLayoutRoute (session check, stream connect)
│   ├── index.tsx                         HomeRoute
│   ├── home.tsx                          HomeAliasRoute
│   ├── welcome.tsx
│   ├── account.tsx                       UserAccountRoute
│   ├── system/
│   │   ├── route.tsx                     SystemRoute
│   │   ├── users.tsx
│   │   ├── organizations.tsx
│   │   ├── requests.tsx
│   │   └── tenants.tsx
│   └── $tenantId.$organizationSlug/
│       ├── route.tsx                     OrganizationLayoutRoute  ← fork extension point
│       └── organization/
│           ├── route.tsx                 OrganizationRoute (redirects to /attachments)
│           ├── attachments.tsx
│           ├── members.tsx
│           └── settings.tsx
├── routeTree.gen.ts                      generated, committed, never hand-edited
├── router.ts                             unchanged except routeTree import
├── routes.gen.css                        (if plugin emits; n/a otherwise)
└── types.ts                              BoundaryType + StaticDataRouteOption declaration
```

Fork extension points become directories: a fork drops `_app/$tenantId.$organizationSlug/workspace.$slug.tsx` or `_public/_content/project.$slug.tsx` — no shared file is touched.

Deleted files: `route-tree.tsx`, `route-tree.base.ts`, `auth-routes.ts`, `base-routes.ts`, `home-routes.ts`, `marketing-routes.ts`, `marketing-routes.tsx`, `organization-routes.ts`, `organization-components.tsx`, `system-routes.ts`, `user-routes.ts`, `docs-routes.ts`, `docs-components.tsx`. Kept: `router.ts`, `types.ts`, `route-utils.tsx` (error components / suspense helper; optionally relocate to `modules/common` later).

## Thin shim pattern

Route files contain only: path (filename), `staticData`, glue to module code. Example for the heaviest route:

```tsx
// routes/_app/$tenantId.$organizationSlug/route.tsx
import { createFileRoute } from '@tanstack/react-router';
import { OrganizationLayoutComponent } from '~/modules/organization/organization-layout';
import { organizationLayoutBeforeLoad } from '~/modules/organization/route-logic';

export const Route = createFileRoute('/_app/$tenantId/$organizationSlug')({
  staticData: { isAuth: true },
  beforeLoad: organizationLayoutBeforeLoad,
  component: OrganizationLayoutComponent,
});
```

Conventions:

- **Logic extraction threshold**: `beforeLoad`/`loader` bodies longer than ~5 lines move to `modules/<module>/route-logic.ts`. Trivial ones (e.g. a `noDirectAccess` redirect) stay inline.
- **Components**: never defined in route files. `routes/*-components.tsx` contents move to their modules (`modules/organization/`, `modules/docs/`, `modules/marketing/`).
- **Typed access from modules**: components use `getRouteApi('<route-id>')` (already the established pattern, see `hooks/use-route-context.ts`) — never import the `Route` object from a route file (avoids cycles).
- **Search param schemas**: stay in `modules/<module>/search-params-schemas.ts` (already the case), referenced via `validateSearch` in shims.
- Extracted `beforeLoad` functions take the typed `{ params, context, cause, search }` bag; type the params explicitly in the module function signature.

## Phases

### Phase 1 — tooling bootstrap

1. Bump `@tanstack/react-router`, `@tanstack/react-router-devtools`, `@tanstack/router-plugin` to current latest.
2. Enable the plugin in `frontend/vite.config.ts` (import is already present, commented out). Must be registered **before** the react plugin:
   ```ts
   tanstackRouter({ target: 'react', autoCodeSplitting: true,
     routesDirectory: 'src/routes', generatedRouteTree: 'src/routes/routeTree.gen.ts' })
   ```
3. Verify Storybook/vitest configs that load vite config tolerate the plugin (or exclude it where the router is irrelevant).
4. Add `routeTree.gen.ts` to biome ignore (extend the existing `frontend/src/routes/**` override in `biome.jsonc` or a dedicated ignore), and to knip ignore if flagged.
5. Add `frontend/src/routes/routeTree.gen.ts` to `ignoredFolders` in `cella.config.ts`.

### Phase 2 — create route files, extract to modules

Big-bang within one PR (old and new trees cannot both feed the router). Suggested order — leaf-light sections first to validate the pattern, org section last:

1. `__root.tsx` from `RootRoute` in base-routes.ts (isAuth enforcement reads `matches` — unchanged behavior).
2. `_public/` marketing + sign-out + error (components from marketing-routes.tsx → `modules/marketing/`).
3. `_public/auth/` (pathless→path conversion; per-route `staticData`/redirect logic preserved).
4. `_public/_content/` + `docs/` (components from docs-components.tsx → `modules/docs/`).
5. `_app/` shell: `route.tsx` (session + stream-connect `beforeLoad` → `modules/me/` or keep inline given its coupling to layout), home/welcome/account, `system/`.
6. `_app/$tenantId.$organizationSlug/`: extract org `beforeLoad` (slug resolution, cache seeding, `redirectOnMissing`, `rewriteUrlToSlug`) → `modules/organization/route-logic.ts`; components from organization-components.tsx → `modules/organization/`.
7. Move the `StaticDataRouteOption` module declaration from route-tree.base.ts to `types.ts`.

### Phase 3 — cutover

1. `router.ts`: `import { routeTree } from '~/routes/routeTree.gen'`.
2. Delete the old route files (list above).
3. Remove manual `lazy()` + `withSuspenseSpinner` wrappers where `autoCodeSplitting` now covers them (keep `withSuspenseSpinner` if the spinner UX on layout boundaries is desired — verify visually).

### Phase 4 — update route ID consumers

URLs and `Link to="..."` paths are unchanged. Route **IDs** change because pathless ids (`publicLayout`, `authLayout`, `publicContentLayout`, `appLayout`) become file-path segments (`_public`, `auth`, `_content`, `_app`). Update:

- ~11 `getRouteApi('...')` call sites in `modules/auth/`, `modules/docs/`, `modules/marketing/` (e.g. `/publicLayout/authLayout/auth/authenticate` → `/_public/auth/authenticate`).
- `hooks/use-route-context.ts` (string route IDs).
- Any `useSearch({ from })` / `useParams({ from })` with old IDs (`hooks/use-search-params.tsx` consumers).
- `routes-config.tsx`, `nav-config.tsx`, `menu-config.tsx`: path strings — **unchanged**, verify only.

TypeScript catches every stale ID once the gen tree is registered; this phase is mechanical.

### Phase 5 — sync config and docs

1. `cella.config.ts`: remove pins for `frontend/src/routes/route-tree.tsx` and `frontend/src/routes/marketing-routes.ts`; remove `frontend/src/routes/organization-components.tsx` pin (file deleted). Prerequisite for dropping the marketing pin: align the `AboutPage` export style (default vs named) between cella and raak — the about page component file stays pinned either way.
2. Update `info/ARCHITECTURE.md` (routing section), `.github/copilot-instructions.md` ("Frontend Routing" entry — no more manual route-tree registration), `info/AGENTS.md` if it references routing.
3. Document the fork extension convention (drop-in route files per directory) where fork docs live.

### Phase 6 — verification

1. `pnpm check` (sdk + typecheck + lint) — gen file committed so typecheck needs no extra step.
2. `pnpm test` — frontend vitest.
3. Manual smoke, focusing on behavior that lived in `beforeLoad`/structure:
   - `/` authed → home; unauthed → `/about` redirect; `/home` alias.
   - Org URL with ID → slug rewrite (`rewriteUrlToSlug`); bare org layout path → `/organization` → `/attachments` redirect chain (`noDirectAccess`).
   - Auth redirect with `redirect` search param round-trip.
   - Boundary cleanup (app ↔ public): sheets close, app stream disconnects (router.ts subscriptions — untouched but boundary `staticData` must survive).
   - Docs pages + public SSE stream mounts only under `_content`.
   - Nav tabs (`navTab` staticData) render on system/org tables.
   - Error boundaries per section (`createErrorComponent('app' | 'public')`).
   - PWA/offline: route-level code splitting changes chunk layout — verify precache manifest still covers route chunks.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Route ID renames missed in dynamic strings (not type-checked until used) | Grep for `publicLayout|authLayout|publicContentLayout|appLayout` after cutover; TS catches `getRouteApi`/`from:` literals |
| `autoCodeSplitting` changes chunking → PWA precache or suspense flashes | Compare build output; keep `withSuspenseSpinner` on app layout if needed |
| Pathless→path conversion for auth layout subtly changes matching | URLs identical; verify `/auth/*` matches + `fromRoot` redirect flow |
| Generated file churn in PRs | Committed but biome-ignored and sync-ignored; reviewers skip it |
| Plugin in vitest/storybook pipelines | Storybook doesn't render routes; exclude plugin under `STORYBOOK=true` if it slows startup |
| Upstream layout dir renames break fork route files silently | They break loudly (gen + typecheck fail in fork after sync); document that layout dirs are a stable contract |

## Fork guidance (raak, follow-up)

Out of scope for this plan, but the contract this migration establishes:

- Forks never edit files in `routes/` that upstream owns; they add files (e.g. `_app/$tenantId.$organizationSlug/workspace.$slug.tsx`, `_public/_content/project.$slug.tsx`).
- Fork route shims point at fork modules (`modules/workspace/route-logic.ts` etc.) — current raak `beforeLoad` bodies move there.
- `routeTree.gen.ts` is generated per repo and sync-ignored.
- After this lands in cella, raak's pin list drops `route-tree.tsx`; its seven fork route/component files collapse into drop-in shims + module files.

## Out of scope / later

- TanStack Start adoption (SPA mode, prerendering for `/about`, `/legal`, docs): becomes a build-tooling change after this migration; no routing rework needed.
- Relocating `route-utils.tsx` helpers to `modules/common/`.
- Virtual file routes: rejected — weaker Start story, extra abstraction.
