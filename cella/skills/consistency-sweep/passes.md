# The five passes

Each pass is one agent over the whole group. Earlier passes are committed when the next one starts, so names and line numbers in the scout report may have moved: an agent locates a lead by what it describes.

## 1. Bugs, dead reads, DRY and pattern reuse

Bugs and dead reads first: an attribute styled but never set, a class reading a group nobody declares, an option nothing passes, a branch that cannot run, a promise in a comment the code does not keep, a `memo` the recursion skips. Then duplication: the same markup or call sequence at three sites (or two that would change together), two helpers for one job, a pattern a primitive already covers. Extract to the lowest directory that covers every user; replace every duplicate; give a new shared piece a one-line JSDoc and a name that says what it is for a reader. A removed symbol must have no consumer outside the group.

## 2. Naming

Decide one scheme for a component family (prefix, what "edit" means, list vs row, how a file name relates to its main export) by checking how sibling modules do it, write it down at the top of the report, then apply it with `git mv` for files. Callback props `onX`; handlers `handleX` or a verb; `isX`/`canX` predicates; store actions say `set` (takes a value), `toggle` (no value) or `reset`, with parameters named after their field; refs end in `Ref`; nouns for lambda parameters; `interface XProps`; a misnomer gets the name of what the thing does. Persisted store fields never rename. An exported name a consumer outside the group imports stays unless renamed everywhere.

## 3. Tailwind A

Rules, in order of importance: `cn` only where it earns its place; one mechanism per state; no-op and dead classes removed with a proof (initial values, duplicates of a component's base, group markers without a consumer, `relative` with nothing positioned against it, a transition on a property that never changes); `!` only where the cascade needs it (run the pair through tw-check); `transition-all` to the properties that change; arbitrary values replaced only by an exact theme equivalent; repeated class strings (three or more) as a `tw` constant or a small component; Biome sorts the rest. Browser defaults to rely on: `flex-direction: row`, `justify-content: normal` (behaves as `flex-start` in a flex container), `opacity: 1`, `width: auto`, `border-radius: 0`, `min-width: auto`. Two traps to remember: a parent's `[&>svg]:size-*` rule (0,1,1) outranks the icon's own `size-*` (0,1,0); and a lucide svg flex item shrinks to 0px when its row overflows, so `shrink-0` on an icon is a no-op only where the parent sets `[&_svg]:shrink-0` or the row cannot overflow (prove the row, not just the class).

## 4. Tailwind B

Part A: re-verify every change of pass 3 against its report's proofs, fixing anything wrong. Part B: the visual redundancies the first pass could not decide, now decided by the maintainer: two looks for one idea, a shadow written as arbitrary where a theme ring exists, a wrapper that only carries classes a child could carry, a component overriding a variant with more classes than another variant would need, an empty header that still renders. Each one names its visible change.

## 5. Style and comments

Structure: render closures and IIFEs in JSX become early returns or small components; `setX(!x)` becomes the updater form; `onClick={() => fn()}` becomes `onClick={fn}` when the signature allows; `useCallback`/`useMemo` without a justifying comment go; React types by name; casts to typed alternatives; `displayName`, trailing export lists, stray `key`s, dead lint comments go; hardcoded English through keys. Comments: every one sorted into keep, trim, fix or delete in a verdict table (`file:line`, verdict, one reason), per the budget in the brief.
