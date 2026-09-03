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

- Keep texts short
- One-word translations have a one-word key
- Two- or three-word translations have a two-word key
- Above three words is a sentence
- Action related sentences have a prefix such as `question.`, `confirm.` or `success.`
- Other (explanation related) sentences have a suffix `.text`
- Only the first letter of the first word is uppercase. For explicit lowercase, lowercase at the usage site (`.toLowerCase()` or an interpolation value such as `resourceLowerCase`).
- Sort JSON translation keys alphabetically
- Modules or pages with many unique texts get their own namespace and json (`about:` keys come from `about.json`)

### Files and runtime namespaces

| File | Content | Runtime namespace |
| --- | --- | --- |
| `common.json` | generic cella texts, frontend and backend | `c` |
| `app.json` | app-specific texts, kept apart so upstream syncs never conflict with cella-owned `common.json` | `c` |
| `about.json` | marketing 'about' page | `about:` |
| `error.json` | error texts, frontend and backend | `error:` |
| `backend.json` | pure backend texts, mostly emails | `backend:` |
| `appError.json` | app-specific error texts, not shipped by cella: create it and register it in `backend/src/lib/i18n-locales.ts` instead of touching cella-owned `error.json` | `appError:`, tried before `error:` (`ns: ['appError', 'error']` in `backend/src/core/error.ts`) |

> [!IMPORTANT] `common.json` and `app.json` are **merged into one `c` namespace** at runtime: every key from either file is `t('c:key')`. No `app:` or `common:` namespace exists; `t('app:key')` resolves to nothing. The backend loads `common.json` under the same `c` namespace.

### Loading

| Path | Mechanism |
| --- | --- |
| Frontend, bundled | `frontend/src/lib/i18n-locales.ts` statically imports `en` and merges `c` in code, so English renders without a network roundtrip. |
| Frontend, lazy | Other languages and HTTP-loaded namespaces are fetched from `/locales/{lng}/{ns}.json`. `frontend/vite/locales-plugin.ts` builds them (`common.json` + `app.json` into `c.json`), serves them in dev, emits them as build assets, and writes the same output to `.vscode/.locales-cache` for i18n Ally. |
| Backend | `backend/src/lib/i18n-locales.ts` statically imports all languages at server start (no lazy loading). Apps extend it when adding languages or namespaces. |
