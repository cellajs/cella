---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: hover:bg-accent/, hover:bg-foreground/, hover:bg-muted/, hover:bg-secondary, data-dropdowner-active:bg-, --secondary, --accent, --muted, --brand
roots: frontend/src
---

# Buttons follow shadcn's base-vega, and the plain and none variants are gone

The `plain` and `none` button variants are removed: the codemod turns `plain` into `secondary`, and each `none` becomes
`ghost` or a native `<button>`. Pressables (ghost, outline, toggle) hover and open with `muted`, navigable items highlight
with `accent`, the nav bar uses `sidebar-accent`, and every button has a 1px transparent edge. A button `className` that
sets color, a hand-rolled neutral hover (`hover:bg-accent/50`, `hover:bg-foreground/8`) and an open-menu fill are listed
for a hand decision. `--brand` defaults to `var(--primary)`.

## What & why

Neutral hovers took eighteen recipes, three variants served the second-rank action and one button in five restyled its
variant. `ui/button.tsx` now follows shadcn's base-vega: `secondary` hover strengthens, `ghost` and `outline` fill with
`muted`, `aria-expanded` shows open, solids hover at `/80`. Outline keeps the input edge and its opaque dark fill. The
dialog, sheet, alert, toast and chip close buttons are one ghost icon button. `tailwind.css` states each color token's role.

## Blast radius

Frontend only. After the upgrade, `plain` and `none` fail typecheck and the codemod fixes `plain`. The rest only shows by
reading: color overrides, own hovers, open-menu fills, a one-side border on a button. Neutral `plain` buttons look alike;
tinted ones turn neutral. No database, lens or cache change.

## Run

```sh
pnpm cella align --run 20261027T2026-button-variants                          # report only
pnpm cella align --run 20261027T2026-button-variants -- rewrite frontend/src   # apply
```

## Manual steps

1. For each `variant="none"`: `ghost` when a hover fill fits, else a native `<button type="button">` with the layout classes (as `common/sheet-tabs.tsx` does).
2. A `'plain'` in another variant value, such as an options object: `'secondary'` when it reaches a button; Badge and Alert keep `plain`.
3. A `plain` button that should keep its tint becomes `variant="default" soft` (or `brand` soft).
4. For each button `className` that sets a fill, edge color or text color: drop what the variant covers; keep width, margin, radius, reveal opacity (`opacity-0` until hover) and a role color such as `text-destructive`.
5. A one-side edge (`border-b`) next to an edge color now colors all four sides: color that side (`border-b-<color>`); drop a `border-0` that only evened out the box.
6. A neutral hover: `hover:bg-muted` on a pressable (button, tile, toggle, grip), `hover:bg-accent` on a navigable item, `bg-accent font-medium` on the current item of a nav list, `hover:bg-sidebar-accent` in the sidebar, `hover:bg-muted/50` on a table row.
7. An open-menu fill on a dropdowner trigger becomes `data-dropdowner-active:bg-muted`.
8. In `styling/app.css`, drop `--brand` and `--brand-foreground` where they repeat `--primary`; a value on `--secondary`, `--muted` or `--accent` now tints secondary buttons, every pressable hover or every highlighted item.
9. A fork of `ui/button.tsx`, `ui/dialog.tsx`, `ui/alert.tsx`, `ui/toast.tsx`, `ui/chip.tsx` or `common/close-button.tsx`: merge the upstream version by hand.

## Verify

```sh
pnpm cella align --run 20261027T2026-button-variants   # only the judge lines you chose to keep
pnpm style:audit                                       # button-recipe markers: the overrides you kept
pnpm check
```

Then look at the sign-in page, a dialog, a menu, a data grid toolbar, the menu sheet and the nav bar in light and dark
mode.

## Known app sites

Scanned on 2026-10-27 at each app's checkout (last upgraded to `a874d1872`). Neither app forks a changed primitive. Template
files an app left unchanged update with the upgrade, which carries 30 `plain` rewrites and the 3 `none` sites; these remain.

projectcampus:

- Its 31 `plain` buttons rendered teal and turn neutral gray (me, auth, API keys, onboarding, pricing). `default soft` keeps teal.
- `styling/app.css:49, 67`: `--brand` repeats `--primary` in both modes; drop the four brand lines.
- Hovers: `channel-tile/channel-about-row.tsx:47`, `comment/thread/comment-thread.tsx:122`, `item/create-item-form.tsx:198`, `material/materials-list.tsx:251`, `marketing/features-page.tsx:169`.
- Open fills: `common/product-card-parts.tsx:82`, `item/feed/item-feed.tsx:324`.
- `comment/thread/comments-list.tsx:81`: its dashed `border-b` rule turns into a dashed box (step 5).
- Color overrides: `channel-tile/channel-membership-button.tsx:102`, `comment/thread/comment-thread.tsx:56`, `item/feed/feed-composer.tsx:60`, `item/feed/aggregated-item-feed.tsx:41`, `milestone/milestone-panel.tsx:111`, `milestone/submission-banner.tsx:44`. The white buttons on the teal hero (`marketing/about/about-page.tsx:31, 39`, `marketing/nav.tsx:131`) keep theirs.
- Expect merge conflicts in `navigation/menu-sheet/item.tsx` (its own `className` prop on the changed line) and `common/data-grid/utils/style-utils.ts` (an edit on the next line).

raak:

- 7 `plain` rewrites in its own files (`task/board/*`, `task/panel/task-panel-header.tsx`, `task/task-selected-buttons.tsx`, `marketing/about/pricing.tsx`), plus `workspace/header/action-buttons.tsx:45` by hand: `variant: 'plain' as const` feeds a button.
- Open fills: `label/label-options-button.tsx:82`, `task/board/project-actions-menu.tsx:129`, `task/card/task-options-button.tsx:100`, `workspace/header/action-buttons.tsx:118`.
- Hovers: `label/label-tile.tsx:174, 202`, `task/card/task-card.tsx:202`, `task/create-task-form.tsx:272`.
- One-side edges: `task/create-task-form.tsx:400`, `task/panel/panel-status-section.tsx:132` (their side colors stay; each button gains a transparent edge on the other sides).
- `styling/app.css` sets no color token: a green `--brand` later shows only where a brand variant asks for it.
