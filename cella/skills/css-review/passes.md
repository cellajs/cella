# The passes

Each pass is one agent over the scope, in this order. It starts from the tool output, reads only flagged files and the components around them, and proves every lead before reporting it. Report, for each finding: `file:line`, the fix, the proof, confidence, whether it breaks an app. Keep rejected leads with their reason, since they become this file's lists of what looks wrong and is fine.

[AGENTS.md](../../AGENTS.md) and [UI styling](../../../frontend/README.md#ui-styling) are the conventions; the [consistency sweep's Tailwind rules](../consistency-sweep/brief.md#conventions) say how `cn` is written. A primitive in `modules/ui/` carries ports and reasons: read its comments and allow that an app may use a marker before calling one dead. The vendored `common/data-grid/` keeps its own API.

## 1. State and `cn`

From `state-check.mjs`, then a census of class expressions by argument shape.

**A variant nothing can satisfy.** Check who writes the attribute, since the forms differ: Base UI writes `data-x=""`, a React boolean writes `"true"` or `"false"`, a date picker may write `"true"`. So `data-[x=true]` misses a Base UI presence attribute, and a bare `data-x:` always matches a boolean JSX attribute. A named `group/x` is not read by an unnamed `group-*`, or the reverse. `peer-disabled:` never matches a Base UI root that renders a span.

**One mechanism per state.** A state exposed as an attribute is styled through its variant. Moving a class from `cn(cond && 'x')` to a variant is more than a respelling, so check both of these before converting:

- It leaves `cn`'s merge. `cn('data-vertical:w-2.5', 'w-3')` keeps both, and the caller's `w-3` loses while the attribute is present.
- It moves in the cascade. A plain class picked by JS loses to `hover:` and `group-hover:`; a `data-[x]:` class beats them; a `:where` custom variant such as `data-vertical:` still loses to them.

**A class that looks unneeded.** Run the real `cn` from `frontend/src/utils/cn.ts` on the actual caller classes before removing one, including `sm:` siblings: `cn` may be resolving a conflict. Merge cost is no reason to remove a `cn`.

**A utility as a selector** (`group-[.text-lg]/x:`) couples a look to a class a caller happens to pass. Use a named attribute.

**When `cn.ts`, the theme or a plugin changes**, compare what `cn` merges with what the compiled CSS sets: a base it does not group, such as `max-h-none`, keeps both classes and renders right only by sort order.

Looks wrong, is fine:

- `isSelected` in a select item when a comment says the library's indicator can go stale.
- A `className` placed first because those classes must beat the caller.
- `transition-spacing` when the theme defines the name.
- A conflict report for `x && a, !x && b`: the branches exclude each other.
- `data-x:` beside a prop that is never `false`.

## 2. Props

From `prop-table.mjs`. Being class-only separates almost nothing. **A style prop is a finding when deleting it loses no decision**: no caller in the template or apps passes it, its value is a no-op or restates another prop, nothing observes the difference between its values, or every sibling in a list gets the same value, so the parent can say it once.

Decide in this order:

1. **Is it style at all?** `pointer-events-none`, `hidden`, `sr-only` and `data-autofocus` change behavior.
2. **Deletion.** List the values across the template and apps. Does anything change if the prop goes?
3. **Reach.** Can the caller reach the target from an element it already renders? A portalled positioner, a second element or a target behind a wrapper fail this. `*:` needs a direct child. Open the DOM path from the caller to the target.
4. **Call site.** Does the replacement read as well? A name for a recipe (`sticky`, `dirty`) beats copying the recipe. A replacement must delete the prop: if it has to stay for `aria-expanded`, rewriting its class as a variant adds characters and removes nothing.

Keep a `cva` variant or typed union that is a closed scale used at several sites or by apps, that lands on more than one element, or that mirrors the shadcn API on a `ui/` primitive. Drop one that maps to a single utility on a single element with one non-default caller.

Traps:

- Rows forwarding through `...rest` are not drilling; count named forwards only.
- The table's `unused` category needs a grep: a shared props type or `props` passed whole reads as unused.
- A boolean has one value at every site, so "one value" means nothing until you compare the sites that omit it.
- `in-*` compiles to `:where(...) .x`, a lower specificity than `group-*`: compile the replacement and compare the selectors.
- A removal an app passes fails its typecheck, which is loud. A class or attribute hook that moves changes its rendering with no error, which is the one to name in the alignment.

## 3. Classes and drift

From `canon-check.mjs`. Apply the proven rewrites where they read better. Read each held one:

- `text-x/y` sets no `--tw-leading`, so a later size at another variant falls back to its own default.
- `[&>*]:x` to `*:x` keeps specificity and moves the sort order, so a child's `sm:` class starts to win. `[.x_&]` to `in-[.x]` drops specificity. Both are cascade changes.
- A collapse into a declared utility can be a coincidence of values: `group-label` heads content, a tab trigger with the same tokens does not. Each new `@utility` becomes such a target.
- `border-(--color-border)` to `border-border` is wrong on an element that sets that variable inline, as chart indicators do.

Never pass `rem` to the canonicalizer: the root font size differs on phones, so `w-[200px]` is not `w-50`.

**Drift** is found by role, not by frequency: project class strings onto families (popup surface, focus ring, link underline, hover reveal) and read the near-copies. Whole-string clustering and raw frequency find only layout. A comment at the site often states why a copy differs.

**A new class** needs all of these, or it stays a literal:

1. No shorthand or existing class covers it.
2. At least 5 tokens and 150 characters.
3. At least 10 sites across 5 modules with the same variant stack. A site that needs another selector or group name does not count, because a class takes no parameter.
4. Coupled: most tokens are not layout, and removing one causes a visual bug.
5. At least 3 unrelated components use it, and a near-copy differs for no reason, or a README rule binds every copy.

`focus-effect` passes (6 tokens, 197 characters, 46 sites, 10 modules). A utility doing what plain tokens cannot (a media query inside a state, a pseudo-element) is judged on that capability, with at least 2 sites or a documented app contract. A family member of a passing class passes with it.

| Situation | Use |
| --- | --- |
| A shorthand exists | The shorthand |
| Layout, or 3 tokens or fewer | A literal |
| One module, or sites that override single tokens through `cn` | A `tw` constant |
| Varies by prop on one component | `cva` |
| Always the same element and behavior | A small component |
| The risk is one token missing its partner | A pair rule in `pnpm style` |
| Passes the bar, or needs a capability | A class or `@utility` |

## 4. Performance

Run `flip-scan.mjs` over pages with the most elements, then follow [measuring.md](./measuring.md). Look at state changes high in the tree before any row class.

What costs:

- **An inherited custom property written per frame on a high ancestor** restyles its whole subtree. Grep `setProperty('--` in pointer and animation paths. It belongs on the element that reads it.
- **Flipping a class or attribute named in a `group-[.x]`, `group-data-*` or `group-not-*` rule** restyles the flipped element's whole subtree, on any element, also on pages that never render the consumer. An `in-[...]` form scoped by class fixes it only when every rule sharing that key changes. `group-hover` is targeted already.
- **A custom variant of the form `:is(.a *, .b *)`** has the same cost. Write `:is(.a, .b) &`. Never `:where(.a, .b) &`, which drops specificity.
- **`space-*` and `divide-*`** compile to `:where(.x > :not(:last-child))`, which Chrome tries on every element. Each value used anywhere, stories included, ships such a rule.
- **More than about 100 rows in the DOM** of a list that is not virtualized, a threshold from a fixture and not from a real page.

Rules to keep: do not add a transition to a row or cell whose property changes on hover or scroll, and do not put `content-visibility` on subgrid rows, which breaks the column positions.

Measured with no gain in the template, so no finding without new evidence: `transition-all` where only colors change, `*:` and `[&_svg]:` on rows, `:has()`, `dark:`, `@property`, typography rules on pages without prose, `tabular-nums`, stylesheet size, `overflow-clip`, hover shadows on the main thread.

Do not swap `group-*` for `in-*` by rule. `in-hover:` matches any hovered ancestor, body included, and `in-data-[expanded=true]:` also matches a farther ancestor with that attribute.

An action's frequency is a judgment too: a theme switch is costly and rare.

## 5. Sibling comparison

A different lens from the census. Go through families of siblings (tiles, sheets, form fields, empty states, list rows, headers, triggers) and compare how they do the same thing: open, invalid, hover, press, current, busy, focus. Each finding is an absence or a difference, such as a field with no invalid edge among fields that have one, or a dropdown trigger that restates by hand what `aria-expanded` would give it.

Check perceivable state on the way: a state shown only in a class, with no ARIA attribute, and a control `touch-probe.mjs` lists. These go to the [a11y-review](../a11y-review/SKILL.md) ledger, since an agent's call on a WCAG criterion stays provisional until a person confirms it.

Skip a family the last iteration covered and found nothing in. A regex-shaped find here is a rule waiting to be written, so count it as such and move on.

## 6. Refutation

Try to break each claim against the source, compiled CSS, real `cn` runs or a browser. Report each as confirmed, partial with the correct version, or refuted with the proof. Run every stated example. For a general rule, look for one case in the repo where it is wrong or has no effect, and rewrite it in terms of what triggers it. A rule that survives only with exceptions keeps them in its text.
