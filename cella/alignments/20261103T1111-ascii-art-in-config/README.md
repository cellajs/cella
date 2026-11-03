---
breaking: true
clientCacheBump: false
caughtBy: compiler
---

# The startup banner is `appConfig.asciiArt`

The ASCII art in the browser console and the API log now comes from `asciiArt` in `shared/config/config.default.ts`, and `shared/utils/ascii` with its `renderAscii` is gone. Add `asciiArt` to your config: your own art, one string per line, or `[]` for no art.

## What & why

`renderAscii` printed the template's logo, so every app showed "cella" in its console and logs. The art is now a config value beside `name` and `slug`, which the app owns. The frontend's `main.tsx` and the backend's `main.api.ts` print it when it has lines.

## Blast radius

Every app: its config lacks the key, so `satisfies RequiredConfig` and both entry points fail to typecheck until it is added. No database or cache change.

## Run

No script: manual.

## Manual steps

1. In `shared/config/config.default.ts`, add `asciiArt` under the app identity keys: your art as an array of lines, escaping `\` and `'`, or `[]`.
2. Replace any import of `shared/utils/ascii` in app code with `console.info(appConfig.asciiArt.join('\n'))`.

## Verify

```sh
pnpm check
```

Run `pnpm dev`: the art shows in the API's startup lines and in the browser console.
