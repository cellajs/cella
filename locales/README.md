# Locales
In this folder we manage the translations that is handled using i18next.

* [i18next documentation](https://www.i18next.com/)
* [react-i18next documentation](https://react.i18next.com/)
* [i18n ally documentation](https://github.com/lokalise/i18n-ally/wiki)

### Install i18n Ally (VSCode)
We recommend using the VSCode plugin `lokalise.i18n-ally` to manage translations in this `locales` folder.

The recommended settings to put in your `.vscode/settings.json` or to edit in the settings page of your workspace:

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

### Tips for consistency
* Keep texts short
* One-word translations have a one-word key
* Two-word or three translations have a two-word key
* Above three words is considered a sentence
* Action related sentences have a prefix such as `question.`, `confirm.` or `success.`
* Other (explanation related) sentences have a suffix `.text`
* By default only first letter of first word is uppercase, whether a single word, two words or a sentence. For explicitly lowercase, pass a lowercased value at the usage site, for example via `.toLowerCase()` or a dedicated interpolation value such as `resourceLowerCase`.
* Sort JSON translation keys by alphabetical order
* Modules or pages with a big amount of unique texts should get their own translation namespace and json: `about:` keys are provided by `about.json`.

### Translation files & runtime namespaces
The JSON files per language do not map 1:1 to runtime namespaces:

* `common.json`: texts that are in a generic part of cella, used in frontend and backend
* `app.json`: app-specific texts. Forks add their own keys here, so upstream syncs don't conflict with cella-owned `common.json`
* `about.json`: texts in the marketing 'about' page (`about:` namespace)
* `error.json`: error texts used in both frontend and backend (`error:` namespace)
* `backend.json`: pure backend texts, mostly email translations (`backend:` namespace)
* `mini-time.json`: compact relative-time labels, exported separately via `locales/index.ts`

> [!IMPORTANT]
> `common.json` and `app.json` are **merged into a single `c` namespace** at runtime (see `frontend/src/lib/i18n-locales.ts`). All keys from *both* files — including keys you add to `app.json` — are referenced as `t('c:key')`. There is no `app:` or `common:` namespace, so `t('app:key')` resolves to nothing. The backend loads `common.json` under the same `c` namespace.
