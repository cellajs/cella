---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: StatusDot, checking
---

# One status dot

`StatusDot` from `expandable-tile.tsx` is gone; `StatusDot` from `common/status-dot.tsx` is the only one. It takes `variant` (the five tile tones: success, info, warning, destructive, muted) and `pulse`, a ripple that is on by default. projectcampus: `user/invite-groups.tsx` passes `checking`, which becomes `pulse={checking}`.

## What & why

Two components shared one name with different props: `tone` and `checking` on the tile dot, `variant` and `label` on the status dot. The status dot now covers the tile tones, and `pulse={false}` gives the still dot the tile version drew. A dot that pulsed while `checking` now ripples while it checks, the same motion the info panel's status dots use.

## Blast radius

Apps whose own code imports `StatusDot` from `~/modules/common/expandable-tile`. The template's `invite-groups.tsx` and `user-combobox.tsx` arrive already changed. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Import `StatusDot` from `~/modules/common/status-dot`; keep `ExpandableTile` and `tileTones` from `expandable-tile`.
2. Rename `tone` to `variant`. A dot that stood still before takes `pulse={false}`.
3. Replace `checking={x}` with `pulse={x}`. projectcampus `user/invite-groups.tsx`: `<StatusDot variant={tone} pulse={checking} />`.

## Verify

```sh
pnpm check
```

By hand: in the invite dialog, an address that is still being checked ripples, and a settled one stands still.
