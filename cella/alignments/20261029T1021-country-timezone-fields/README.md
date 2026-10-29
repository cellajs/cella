---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: showAvatar, timezones.json, ComboboxOption
---

# Country and timezone fields read countries.json only

An app replaces `appConfig.c` with `commonCountries` (uppercase ISO codes), drops imports of `json/timezones.json`,
names countries through `regionName()` because `json/countries.json` keeps only `code` and `timezones`, and gives a
`ComboboxSelect` option an `icon` where it passed `showAvatar` and an option `url`.

## What & why

The timezone field lists the IANA zones in `json/countries.json` and labels them through `Intl`, so `json/timezones.json`,
the Windows zone list that stored stand-ins such as `Arctic/Longyearbyen`, is gone. `appConfig.commonCountries` fills
the country field's suggested group. `ComboboxOption` gains `icon`, `detail` and `keywords` and loses `url`. The
organization update body accepts only a listed country code and a known IANA zone.

## Blast radius

Every app: typecheck rejects its config's `c` key. Importing `timezones.json`, reading a country's `name` or passing
`showAvatar` fails typecheck too; an option `url` in a variable drops without an error. Stored zones stay valid. No
lens; `clientCacheVersion` is bumped because the narrower country field is a breaking request change.

## Run

No script: manual.

## Manual steps

1. In the app's `shared/config/*.ts`, replace `c: { countries, timezones }` with `commonCountries: ['FR', 'DE', …]`, codes in uppercase.
2. Replace a `#json/timezones.json` import with `timeZoneTable(language)` from `~/utils/time-zones`, and a country's `name` from `#json/countries.json` with `regionName(code, language)` from `~/utils/region-name`.
3. Give a `ComboboxSelect` or `ComboboxFormField` option an `icon`, such as `<EntityAvatar className="size-6" … />`, where it relied on `showAvatar` and `url`.
4. An organization whose `country` holds a name, as an older seed wrote, fails its next update: reseed, or run `update organizations set country = null where country !~ '^[A-Z]{2}$';`.

## Verify

```sh
pnpm check
```
