# Tailwind theme in CSS, tw-animate-css

## What & why

`frontend/tailwind.config.ts` is removed: the theme lives in `frontend/src/styling/tailwind.css` (`@theme`,
`@theme inline` colors, `@custom-variant dark`, `@source`), and breakpoints, the container cap and typography in
`frontend/src/styling/tailwind-plugin.ts`, loaded with `@plugin`. `tailwindcss-animate` is replaced by
`tw-animate-css`, so a `duration-*` next to `animate-in`/`animate-out` now takes effect. The `icon-xs…icon-xl`,
`soft-bg-hover` and sidebar-primary utilities are removed. New: `intent-*`, `bg-overlay`, `text-2xs`, `font-heading`.

## Blast radius

Frontend only, sync-breaking for an app that edited `tailwind.config.ts`, depends on `tailwindcss-animate`, or
uses a removed utility. No `clientCacheVersion` bump, no database change. An app that never customized its
Tailwind setup only runs `pnpm install` and the icon codemod.

## Run

No script: manual.

## Manual steps

1. Move each edit the app made to `tailwind.config.ts` into `tailwind.css` (theme values as `@theme` variables, colors as `--color-*` in `@theme inline`) or into `tailwind-plugin.ts` (JS-only config), then delete the file.
2. In `frontend/package.json`, replace `tailwindcss-animate` with `tw-animate-css` and run `pnpm install`.
3. Run `20261001T2116-tailwind-class-conventions` first: its codemod rewrites `icon-xs/sm/md/lg/xl` to `size-3/3.5/4/5/6`.
4. `rg "soft-bg-hover|sidebar-primary|animate-(waving-hand|spin-slow|heartbeat|hflip|vflip)|translate-active|transition-size|menu-item-sub|slash-menu" frontend/src`: replace or drop each hit (none have a replacement token).
5. `rg "duration-[0-9]+" frontend/src | rg "animate-(in|out)"`: check that each duration is the one wanted, now that it applies.
6. If the app owns `biome.jsonc`, replace its `**/tailwind.config.ts` default-export entry with `frontend/src/styling/tailwind-plugin.ts`.

## Verify

```sh
rg "tailwind\.config|tailwindcss-animate|icon-(xs|sm|md|lg|xl)\b" frontend biome.jsonc
pnpm --filter frontend build
pnpm check
```
