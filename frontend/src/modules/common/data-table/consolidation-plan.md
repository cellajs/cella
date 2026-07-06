# DataGrid / DataTable consolidation — analysis & plan

**Status:** proposal (no code yet). Report requested before implementation.
**Scope:** `common/data-grid/data-grid.tsx` (engine, 1399 lines) and `common/data-table/data-table.tsx` (wrapper, 235 lines), plus their immediate neighbours.

## TL;DR

The instinct is right that there is confusion to remove — but the confusion is **not** "there are two components." It's a **leaky boundary** between them: a duplicated column type, a duplicated mobile-breakpoint read, a large dead "tree grid", and a passthrough tax that forces every new grid prop to be re-declared in the wrapper.

Recommendation: **do the confusion-removing cleanups first (all unambiguous wins, independently shippable), then decide whether to physically merge the two files.** After the cleanups the merge becomes a near-trivial, reversible preference rather than a risky big-bang. Merging the files *before* cleaning the boundary just relocates the mess into one 1600-line component that does two jobs.

## Current topology (as measured, not assumed)

- **`<DataGrid>`** — the engine: virtualization, cell/row selection, editing, keyboard nav, copy/paste, column widths, sticky header, drag-reorder, and now `modes`/merge. Rendered directly by only: the `DataTable` wrapper, `TreeDataGrid` (dead — see below), and a Storybook story. **No feature code renders `<DataGrid>` directly.**
- **`<DataTable>`** — a thin wrapper rendered by **all 15** feature tables (attachments, labels, members, pending-memberships, organizations, pages, requests, tasks, tenants, users, + the 4 docs tables and invitations).
- **The `data-table/` folder is two unrelated things wearing one folder name:**
  1. `data-table.tsx` — the wrapper (this document's subject).
  2. A **"table chrome" kit** — `types` (imported 54×), `table-bar-container`, `table-search`, `table-filter-bar`, `table-count`, `columns-view`, `export`, `checkbox-column`, `sort-columns`, `table-ellipsis`, `tree/`. These are consumed by each module's `*-bar.tsx`, not by the grid. **This kit is legitimate and stays** — it is not part of any grid/wrapper merge.

## What `DataTable` actually adds over `DataGrid`

Not "encapsulation of the grid" — a distinct responsibility: **turning an async query result into a rendered table.** Measured across all 15 consumers:

| Responsibility | Consumers relying on it |
|---|---|
| Initial-load skeleton (`isLoading`/`!rows`) | all 15 |
| Error panel (`error`) | 11 (the query-backed ones) |
| Empty state (`NoRows` + `isFiltered`/`isFetching`/`NoRowsComponent`) | all 15 |
| `InfiniteLoader` (non-virtualized fetch trigger + loading/all-loaded/offline UI) | 10 (5 are static: 4 docs tables + invitations) |
| `MAX_SELECTABLE_ROWS = 1000` selection cap + toast | internal; benefits selectable tables |
| `resetWidthsKey` column-width reset | 1 (operations-table only) |
| Mobile row-height ×1.2 | all (unconditional) |
| `useTableTooltip` | all |
| Column-width `useState` ownership | all |

Only **pages-table** uses the drag/tree passthroughs (`onRowReorder`/`onRowReparent`/`canDropRow`). **No** consumer passes the top-level `renderRow`/`renderCell` overrides.

## The confusion, concretely (this is the real target)

1. **Two `ColumnOrColumnGroup` types, same name.** `data-grid` exports one; `data-table/types.ts` re-exports it **extended with `hidden`**. 54 files import the data-table variant. Neither component acts on `hidden` — it's filtered **consumer-side**, duplicated **12×** as `columns.filter((c) => !c.hidden)`. So there is a column type whose defining field neither the engine nor the wrapper honours. This is the single biggest "which type do I import / who handles this flag" trap.
2. **Two breakpoint reads for "mobile," at different breakpoints.** `DataTable` calls `useBreakpointBelow('sm')` to scale row height ×1.2; `DataGrid` calls `useCurrentBreakpoint() === 'xs'` for selection-disable and now `modes`. Different thresholds (sm vs xs), no single source of truth. The `modes`/`activeModes` work already established the grid as the natural home for "what viewport mode are we in"; the wrapper's ×1.2 is an orphan.
3. **`data-grid.css` imported 3×** — `data-grid/index.ts`, `data-table.tsx`, `no-rows.tsx`. The `index.ts` import already covers every render path; the other two are redundant.
4. **Dead component `TreeDataGrid`** (`data-grid/tree-data-grid.tsx`, 443 lines) — a row-**grouping** grid. Not exported from `data-grid/index.ts`, **zero renders anywhere**. Meanwhile the tree that *did* ship (page hierarchy) is an entirely different mechanism: `data-table/tree` + `DataTable` passthrough props, wired in `pages-table.tsx`. Two "tree" concepts, one of them dead — a prime source of "wait, which tree?".
5. **Dead prop `overflowNoRows`** — declared on `DataTableProps`, never read.
6. **Passthrough tax.** ~25 of `DataTable`'s props are pure forwards to `DataGrid`. Every new engine prop must be re-declared and re-threaded (the `isCompact`/modes work already had to touch `DataTable` for exactly this reason). This is the maintenance cost the "why is there a wrapper at all" instinct is reacting to.

## Options

### Option 1 — Merge `DataTable` into `DataGrid` (one component)
Fold the 7 wrapper responsibilities into `DataGrid` as opt-in props.
- **Pro:** one import; passthrough tax gone; `hidden` + mobile-height live where `modes` already lives.
- **Con:** `DataGrid` grows to ~1600 lines and conflates two concerns — a **grid engine** and **async-data orchestration** (skeleton/error/empty/infinite/toast). The 5 static tables and the Storybook story would carry query-state surface they don't need. The engine↔query split is a *real* boundary; collapsing it moves confusion rather than removing it.

### Option 2 — Keep two files, fix the boundary *(recommended first phase)*
Remove every confusion in the list above without collapsing the engine/query concern:
- **(2a) Unify the column type** — move `hidden` onto the grid's `Column`, have `useCalculatedColumns` drop hidden columns (exactly where it already drops by breakpoint), and delete the 12 consumer-side `filter(!hidden)`. Collapses the two same-named types into one. *Highest value; this is the literal confusion.*
- **(2b) Delete dead code** — remove `TreeDataGrid` (443 lines) and `overflowNoRows`.
- **(2c) Single mobile source** — move the row-height ×1.2 into the grid's `activeModes`/rowHeight path; drop `DataTable`'s separate `useBreakpointBelow`.
- **(2d) De-dupe the css import** — keep only `index.ts`.
- **(2e) Kill the passthrough tax** — have `DataTableProps` spread `...gridProps: Partial<Pick<DataGridProps, …>>` (or extend it) so new engine props need no re-declaration.
- **(2f) Name the boundary** — document `DataGrid` = engine, `DataTable` = query-backed table; one short comment at each entry point.

### Option 3 — Full three-layer re-layer (engine / async-data / chrome-kit)
Explicit packages for each. Largest change; over-engineered for the payoff here.

## Recommendation

**Option 2 as phase one, then reassess Option 1.** Rationale:

- Every 2a–2f item is a strict win regardless of whether the files ever merge — they delete duplication and dead code, not restructure behaviour.
- They directly discharge the stated complaint ("confusion"): after 2a there is one column type; after 2b there is one tree concept; after 2c one mobile source; after 2e no re-threading of new props.
- Once the boundary is clean, **if** a single entry point is still wanted (a fair goal given `DataGrid` is already app-coupled, not a generic lib), the physical merge is a small, low-risk, reversible step — the hard part (untangling shared state and duplicated logic) is already done.
- Merging first (Option 1 before 2) would carry the duplicate type, the dead tree, and the double breakpoint *into* the merged file — strictly worse.

The honest counter to "the wrapper earns nothing because the grid is app-coupled": the wrapper isn't abstracting the *engine*, it's owning *query/async state*. That responsibility is real and used by all 15 tables. The wrapper's problem isn't that it exists — it's that its boundary with the engine leaks. Fix the leak first.

## Suggested commit sequence (small, independently reviewable)

1. **Delete dead `TreeDataGrid` + `overflowNoRows`** (2b) — pure deletion, no behaviour change. *(Verify the row-grouping story isn't relying on it — it renders `DataGrid` directly, not `TreeDataGrid`.)*
2. **De-dupe `data-grid.css` imports** (2d) — one line each.
3. **Unify the column type: `hidden` into the engine** (2a) — move the flag, filter in `useCalculatedColumns`, delete 12 consumer `filter(!hidden)`, collapse `data-table/types` `ColumnOrColumnGroup` to a re-export. Largest blast radius; do it on its own.
4. **Single mobile source: row-height ×1.2 into `activeModes`** (2c) — remove `DataTable`'s `useBreakpointBelow`.
5. **Prop-spread to kill passthrough tax** (2e) + boundary doc comment (2f).
6. **(Decision point)** Reassess whether to physically merge (Option 1) now that the boundary is clean.

## Risks / watch-items

- **2a** changes where `hidden` is honoured (engine vs consumer). Verify column-visibility pickers (`columns-view`) still round-trip — they toggle `hidden` on the column objects the consumer owns; the engine must read the same field.
- **2c** must preserve today's exact heights (sm×1.2 vs the grid's xs logic differ by one breakpoint — confirm no table relies on the sm–md band getting the taller row).
- **Storybook** is the only non-`DataTable` renderer of `DataGrid`; keep it compiling as the canary for engine-only usage.
- Deleting `TreeDataGrid` removes the only in-repo example of grid **row-grouping**; if that feature is on any roadmap, keep the file in git history / note the SHA before deletion.
