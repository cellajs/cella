---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: dayjs, sdk-trace-web
---

# dayjs leaves the template

The template formats dates through `Intl` and no longer installs `dayjs` or `frontend/src/lib/dayjs.ts`. An app whose
own code imports dayjs moves those calls to the helpers in `frontend/src/utils` (`dateRelative`, `dateMini`,
`dateShort`, `dateFull`), or adds `dayjs` to its `frontend/package.json` with a plugin setup of its own.

## What & why

dayjs never received the active language, so `fromNow()` and `format('MMM D')` wrote English inside Dutch sentences.
`dateRelative` replaces `fromNow()` through `Intl.RelativeTimeFormat`, and the other helpers format months in the
active language. The frontend tracer moved from the deprecated `@opentelemetry/sdk-trace-web` to
`@opentelemetry/sdk-trace`, the line Maple uses.

## Blast radius

Apps whose own frontend code imports dayjs: without the plugin setup, typecheck flags each `.utc()`, `.fromNow()` or
`.duration()` call. An app that never imported dayjs is unaffected. No wire, cache or schema change.

## Run

No script: manual.

## Manual steps

1. List the app's own imports with `grep -rn "from 'dayjs" frontend/src`.
2. Replace `dayjs(date).fromNow()` with `dateRelative(date)` and a `format()` with `toLocaleDateString(i18n.language, ...)`, or run `pnpm --filter frontend add dayjs` and keep a setup file that extends the plugins the app uses.
3. A pinned `frontend/src/main.tsx` or `frontend/.storybook/preview.tsx` drops its `~/lib/dayjs` import.
4. An app that imports `@opentelemetry/sdk-trace-web` takes `TracerProvider` and `StackContextManager` from `@opentelemetry/sdk-trace`, as `frontend/src/lib/otel.ts` does.

## Verify

```sh
pnpm check
```
