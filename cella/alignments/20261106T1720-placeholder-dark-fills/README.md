---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: placeholderColors
---

# Each placeholder color carries its own dark fill, and the cover no longer dims itself

Every entry of `appConfig.placeholderColors` now names its dark mode fill too (`'bg-blue-300 dark:bg-blue-900'`), and the avatar initials turn white in dark mode. The app owns `shared/config/config.default.ts`, so it adds the `dark:` step to each entry itself, also when it kept the template's ten colors.

## What & why

Avatars, channel tiles and the account banner without an image stayed saturated in dark mode; only the cover dimmed, through an overlay of its own in `cover.tsx`. One fill per entry now serves all four, so the overlay is gone. `EntityAvatar` sets the initials' color on `AvatarFallback`: `text-black/50` in light mode, `text-white/60` in dark, which a light fill would not carry.

## Blast radius

Every app, visual only: until its entries carry dark fills, dark mode shows the light fills undimmed, white initials on them at about 1.2:1, and covers no longer dimmed. No database, wire or cache change.

## Run

No script: manual.

## Manual steps

1. In the app's `shared/config/config.default.ts`, give each `placeholderColors` entry a dark fill, such as `dark:bg-<color>-900` beside `bg-<color>-300` (the template's list is the one to copy); the 900 steps keep white initials at 4.2:1 or more.
2. Look at an organization without an image in dark mode: its avatar, tile and cover take the dark fill.

## Verify

```sh
pnpm check
```
