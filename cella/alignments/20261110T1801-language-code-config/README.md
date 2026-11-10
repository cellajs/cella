---
breaking: true
clientCacheBump: false
caughtBy: compiler
---

# Config language keys end in Code

In `shared/config/config.default.ts`, `languages` is `languageCodes` and `defaultLanguage` is `defaultLanguageCode`, and
app code reads `appConfig.languageCodes` and `appConfig.defaultLanguageCode`.

## What & why

The users and organizations tables already name these values `languageCode`, `languageCodes` and `defaultLanguageCode`
(AEP-143). The config used the bare words for the same codes, and `commonRegionCodes` beside them already ends in
`Code`. One name now holds a language code in the config, the tables and the API.

## Blast radius

Every app: its config and every read fail typecheck until renamed. No wire, cache or schema change. `pnpm cella a11y`
needs a CLI release that reads the new keys.

## Run

No script: manual.

## Manual steps

1. In `shared/config/config.default.ts`, rename `languages` to `languageCodes` and `defaultLanguage` to `defaultLanguageCode`.
2. Replace every `appConfig.languages` with `appConfig.languageCodes` and `appConfig.defaultLanguage` with `appConfig.defaultLanguageCode`.

## Verify

```sh
pnpm check
```
