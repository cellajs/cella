# Consistency sweep: shared brief

Every pass agent reads this first, then the group brief and the scout report. Replace the placeholders in angle brackets before handing it out.

## Where to work

- Worktree (the only place you edit): `<worktree path>` on branch `<branch>`, branched from `<base branch>`.
- Your shell cwd may be the main checkout, which other agents use and which may switch branches mid-session. Never edit, run pnpm in, or run git write commands in the main checkout. Address files by absolute path inside the worktree, and run tooling as `pnpm -C <worktree> ...` or `git -C <worktree> ...`.
- Do not commit, stash or branch. Leave your changes in the working tree; the coordinator reviews and commits each pass.
- Group scope: `<directories>`. Edit files outside the group only when the group brief grants it for a named lead. Never touch generated files, `locales/` (except to add a key the group brief allows), `routes/`, `sdk/`, `backend/`.

## Goal and order of priorities

1. Readability and maintainability for a developer meeting this code for the first time.
2. Consistency: one way of doing one thing, inside this group and with the rest of the frontend.
3. Fewer lines, as a consequence of 1 and 2, never as a goal of its own.

Behavior is preserved by default. The maintainer's rule: less code wins; a bug or a redundancy is fixed, not reported; a simplification that removes code or a second way of doing one thing may change rendering a little, and then the commit and the report name the visible change. What still goes to the report: a change that forces a consumer outside the group to edit its code (for the template, anything sync-breaking for the apps), a product decision (wording, a feature's presence), and anything you cannot explain in one line.

## Consumers you must not break

`<the files outside the group that import from it, and the names they import; for the template, which files differ in the apps and which app-owned files import what>`. A symbol imported from outside the group keeps its name and shape unless you rename it everywhere and every consumer still compiles.

## Conventions

[AGENTS.md](../../AGENTS.md) applies in full: its coding patterns, style and naming rules and comment budget. The sweep adds:

Code shape
- Components are `function` declarations; a wrapper takes a named function expression (`memo(function X() {})`), or `memo(XBase)` where the inner name would shadow the wrapper. A component stored as a value is `ComponentType<Props>`. Props are `interface XProps`; a union of shapes stays a `type`. React types are imported by name, never `React.X`.
- Imports use the `~/` alias, as named imports. No `index.ts` barrels.
- Outside hooks a store is reached through its alias (`sheeter.getState()`, `uiStore`, `navigationStore`). Every store exports `export { useX as x };`.
- An unavoidable `any` carries a `biome-ignore` line with its reason. A `useMemo` or `useCallback` stays only with a comment that says why.
- Callback props are `onX`; handlers inside a component are `handleX` or a plain verb; a predicate is `isX`/`canX`. Refs end in `Ref`. Lambda parameters are nouns, not letters (`a, b` in a comparator and an index are fine). Files are named after their main export.
- An offline refusal is `toastOffline()`. `aria-hidden` on a lucide icon is redundant (lucide sets it); an `aria-label` that repeats visible text goes.

Comments
- Keep a comment that explains a non-obvious constraint or a bug workaround; trim or delete one that restates the code, names a location that moved, or promises behavior the code does not have.

Tailwind
- `cn()` joins a conditional, the incoming `className` (last) or a shared `tw` constant (first); a static list is a string literal; a class constant that does not depend on props is a module-level `tw(...)`.
- One mechanism per state: a boolean the element exposes as `data-*` is styled through `data-[x=true]:` (React renders the boolean as a string; bare `data-x:` is for Base UI's presence attributes); a one-off with no attribute uses `cn(base, cond && ...)`; a child styled by a parent's state uses a named kebab-case group. `hasStarted` is `data-started` plus `data-[started=false]:...`.
- A class that restates an initial value, repeats a component base, or has no consumer goes, each with its proof. `!` only where the cascade needs it. `transition-all` becomes the properties that change when they can be listed.
- Do not change `z-*` values, color, opacity or spacing steps for their own sake; a visible change is only the by-product of removing code, and the report names it.

## Verification

Green before you report:

```sh
pnpm -C <worktree> --filter frontend ts
pnpm -C <worktree> exec biome check --write <every directory you touched>
pnpm -C <worktree> style
pnpm -C <worktree> unused            # when an export changed
```

Plus the tests that import a touched file (`pnpm -C <worktree> --filter frontend exec vitest run <files>`) and the stories that render a changed component (`pnpm -C <worktree>/frontend exec vitest run --project=storybook <story file>`).

## Report

Write it to `<reports folder>/<group>-pass<n>-<name>.md`:

1. **Applied**: each change in one or two lines: what, where (`file:line` of the result), why it is better; the scout's lead number where there is one.
2. **Verified equivalent**: for a change whose equivalence is not obvious (Tailwind especially), the one-line proof (which rule wins and why, what the default value is, the compiled CSS you inspected).
3. **Not applied, needs a decision**: one line each with the proposal and the trade-off.
4. **Seen outside the group**: the same pattern elsewhere (paths, counts). Do not fix those.
5. **Checks**: the output tail of the verification commands.
6. **Line count**: `git -C <worktree> diff --shortstat`.
