# Icon conventions migration

Converts icon usage to cella's runtime-only icon convention:

- **Direct `lucide-react` imports** with modern `*Icon`-suffixed names
  (deprecated aliases like `Loader2Icon` → `LoaderCircleIcon`, mapping in
  `deprecated-renames.json`; both enforced via Biome).
- **Sizing via classes only** — semantic `icon-xs/sm/md/lg/xl` utilities
  (12/14/16/20/24px equivalents) or plain `size-*`. Never lucide's `size`
  prop: a global `:where(svg.lucide)` rule (tailwind.css) overrides its px
  width/height attributes so icons default to 1rem and scale with the mobile
  root-font-size bump.
- **No per-icon `strokeWidth={appConfig.theme.strokeWidth}`** — the
  `LucideProvider` at the app root (main.tsx) supplies the default.

Run this on fork-specific code after pulling the upstream icon sweep:

```sh
# from the repo root
pnpm exec tsx cella/migrations/2026-07-icon-conventions/icon-codemod.ts inventory frontend/src   # report only
pnpm exec tsx cella/migrations/2026-07-icon-conventions/icon-codemod.ts rewrite frontend/src     # apply
pnpm exec biome check --write frontend/src
cd frontend && pnpm ts
```

Then review the report the codemod writes next to itself:

- `manualReview` — dynamic size props (`size={someVar}`) and icons whose
  className the codemod couldn't merge into; convert these by hand.
- `bareUsages` — icons with no size class at all. They render the 1rem
  default; icons that previously relied on lucide's 24px default may need an
  explicit `icon-xl`.

Also grep for wrapper components that *forward* a numeric size prop to an
icon (e.g. `iconSize` props) — the prop is inert now and the component
should take a class instead.
