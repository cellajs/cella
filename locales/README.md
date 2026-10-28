# Locales

[i18next](https://www.i18next.com/), [react-i18next](https://react.i18next.com/), [i18n Ally](https://github.com/lokalise/i18n-ally/wiki).

### i18n Ally (VSCode)

Point the VSCode plugin `lokalise.i18n-ally` at the processed cache `.vscode/.locales-cache`, not at the raw `locales/` folder (no raw file maps to the merged `c` namespace). The frontend dev server rebuilds the cache: run `pnpm dev` once if annotations are missing. Edit `locales/<lng>/*.json`, never the generated cache.

Settings for `.vscode/settings.json` (gitignored, once per contributor):

```json
{
  "i18n-ally.localesPaths": [".vscode/.locales-cache"],
  "i18n-ally.annotationDelimiter": ".",
  "i18n-ally.keystyle": "flat",
  "i18n-ally.dirStructure": "dir",
  "i18n-ally.displayLanguage": "en",
  "i18n-ally.extract.keygenStrategy": "slug",
  "i18n-ally.extract.keygenStyle": "snake_case",
  "i18n-ally.enabledFrameworks": ["react-i18next"],
  "i18n-ally.extract.autoDetect": true,
  "i18n-ally.namespace": true,
  "i18n-ally.pathMatcher": "{locale}/{namespace}.json"
}
```

### Key conventions

A key names the concept, so its text can change without a rename. Texts are short, and only the first letter of the first word is uppercase.

**One key, one sentence.** A key holds a whole sentence or label. A slot takes a name, a number, a date or a bare noun, never a clause or a verb. No article or demonstrative stands before a noun slot (`this {{resource}}`): Dutch writes `deze organisatie` but `dit project`, and the template cannot know the gender of an app's entity names, so the sentence names the thing or says "it". Code never builds a sentence from several keys or appends words to a translation.

| Family | Key | Text |
| --- | --- | --- |
| Title and explanation | `<key>`, `<key>.text` | `.text` explains the title; any other sentence outside a prefix group ends in `.text` too |
| Action on a noun | `<verb>_resource` | `Create {{resource, lowercase}}` |
| Outcome toast | `success.<verb>_resource` | `{{resource}} has been created.` |
| Failure toast | `error:<verb>_resource` | `{{resource}} could not be created` |
| Confirmation | `confirm.<verb>_resource` | `Delete {{resource, lowercase}} <strong>{{name}}</strong>?`, then what follows from it |
| Empty state | `no_resource_yet`, `no_resource_found` | `No {{resource, lowercase}} yet` |
| Placeholder | `placeholder.<what>` | `Search {{resource, lowercase}}...` |
| Noun | `<noun>`, `<noun>_other` | `Member`, `Members`; a card or page title may keep a key of its own |
| Count | `<noun>_count_one`, `<noun>_count_other`, or `resource_count` | `{{count, number}} members` |
| One named or many counted | `<key>`, `<key>_counted` | the caller picks by count |

- A sentence that names something wraps the name in `<strong>` (`Revoke API key <strong>{{name}}</strong>?`), never in quotes, and renders through `NamedText`, which shows it in semibold and cuts a `name` longer than 40 characters in the middle
- A sheet or dialog opened over an entity page names that entity (`Manage users invited to join <strong>{{name}}</strong>.`) rather than saying "this organization": the page header is out of view behind it. Texts that describe a kind of tab or card stay generic.
- A caller passes a noun in its label form, `t('c:organization')`. A translation that puts it inside a sentence writes `{{resource, lowercase}}`, which lowercases the first letter and keeps an acronym ("API key"); a language that capitalizes nouns leaves the formatter out. A whole translation shown lowercase inside a line, such as a note after a name, is lowercased at the usage site.
- `{{appName}}` and `{{company}}` are filled in for every translation; a caller passes neither.
- One named item and a counted many are two keys, not plural forms: `_one` also covers 21 in Russian and 0 in French, and `_many` is itself a plural suffix.
- `_one` and `_other` with the same text are one base key: i18next falls back to it, and a language that needs separate forms adds them.
- Sort JSON translation keys alphabetically
- Modules or pages with many unique texts get their own namespace and json (`about:` keys come from `about.json`)

### Files and runtime namespaces

| File | Content | Runtime namespace |
| --- | --- | --- |
| `common.json` | generic cella texts, frontend and backend, including the backend texts an app adds its own of per type (notification and digest lines), since only `c` takes app overrides | `c` |
| `app.json` | app-specific texts, kept apart so upgrades never conflict with cella-owned `common.json` | `c` |
| `about.json` | marketing 'about' page | `about:` |
| `error.json` | error texts, frontend and backend | `error:` |
| `backend.json` | pure backend texts, mostly emails | `backend:` |
| `appError.json` | the app's own error types, kept apart from cella-owned `error.json`. cella ships it empty and never syncs it. Add `<type>` (the title) and `<type>.text` (the explanation), then throw `new AppError(status, '<type>', severity)`: the type is typed from this file | `appError:`, tried before `error:` (`ns: ['appError', 'error']` in `backend/src/core/error.ts`) |

> [!IMPORTANT] `common.json` and `app.json` are **merged into one `c` namespace** at runtime: every key from either file is `t('c:key')`. No `app:` or `common:` namespace exists; `t('app:key')` resolves to nothing. The backend loads `common.json` under the same `c` namespace.

### Loading

| Path | Mechanism |
| --- | --- |
| Frontend, bundled | `frontend/src/lib/i18n-locales.ts` statically imports `en` and merges `c` in code, so English renders without a network roundtrip. |
| Frontend, lazy | Other languages and HTTP-loaded namespaces are fetched from `/locales/{lng}/{ns}.json`. `frontend/vite/locales-plugin.ts` builds them (`common.json` + `app.json` into `c.json`), serves them in dev, emits them as build assets, and writes the same output to `.vscode/.locales-cache` for i18n Ally. |
| Backend | `backend/src/lib/i18n-locales.ts` statically imports all languages at server start (no lazy loading). Apps extend it when adding languages or namespaces. |
