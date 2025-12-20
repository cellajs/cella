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

### WebStorm / JetBrains IDEs
For WebStorm users, you can achieve similar inline translation previews using:

1. **Interactive i18n plugin**: This is the closest equivalent to `i18n-ally`.
   - Install the "Interactive i18n" plugin from the JetBrains Marketplace.
   - Configure the locales path to `.vscode/.locales-cache` to benefit from the project's auto-merging logic (e.g., `common` + `app`).
2. **Built-in Localization support**: Since version 2024.1, WebStorm includes a bundled "Localization" feature.
   - It should automatically detect the `locales` folder, but you might need to enable "Inlay Hints" for i18n in `Settings > Editor > Inlay Hints`.

### Tips for consistency
* Keep texts short
* One-word translations have a one-word key
* Two-word or three translations have a two-word key
* Above three words is considered a sentence
* Action related sentences have a prefix such as `question.`, `confirm.` or `success.`
* Other (explanation related) sentences have a suffix `.text`
* By default only first letter of first word is uppercase, whether a single word, two words or a sentence. For explicitly lowercase, add a suffix `.lc`.
* Sort JSON translation keys by alphabetical order
* Modules or pages with a big amount of unique texts should get their own translation namespace and json: `about:` keys are provided by `about.json`.

### Different namespaces
* `common`: texts that are in a generic part of cella
* `about`: texts that are in the marketing 'about' page of cella
* `backend`: pure backend texts, mostly email translations
