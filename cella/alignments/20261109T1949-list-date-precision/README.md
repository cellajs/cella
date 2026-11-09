---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: dateShort, .calendar(
---

# Table dates read by day, set by `listDatePrecision`

Add `listDatePrecision: 'day'` to `shared/config/config.default.ts`, or `'minute'` to keep the time in tables and
channel tiles. A date column written by hand that calls `dateShort` moves to `dateColumn` to follow the setting. An app
that calls dayjs `.calendar()` extends that plugin itself.

## What & why

`dateColumn` and the channel tile read `appConfig.listDatePrecision`: `'day'` shows "Today" or "Sep 23", with the exact
moment in a `DateTooltip`. `dateShort` takes a precision and defaults to `'minute'`, so other calls keep the time.
`dateShort` and `dateFull` follow the active language through `Intl`, which replaces the dayjs `calendar` plugin.

## Blast radius

Every app: the config type requires the new key, and tables lose the time under `'day'`. No wire, cache or schema
change.

## Run

No script: manual.

## Manual steps

1. Add `listDatePrecision` under `commonCountries` in `shared/config/config.default.ts`.
2. Replace a hand-written date column whose `renderCell` calls `dateShort` with `dateColumn`.
3. Where the app calls `.calendar()`, add `dayjs.extend(calendar)` to its own dayjs setup.

## Verify

```sh
pnpm check
```
