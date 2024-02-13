# Locales
In this folder we manage the translations that is handled using i18next.

* [i18next documentation](https://www.i18next.com/)
* [react-i18next documentation](https://react.i18next.com/)
* [i18n ally documentation](https://github.com/lokalise/i18n-ally/wiki)

### Install i18n Ally
We recommend using the VSCode plugin `lokalise.i18n-ally` to manage translations in this `locale` folder.

The recommended settings to put in your `.vscode/settings.json` or to edit in the settings page of your workspace:

```
{
  "i18n-ally.localesPaths": ["locales"],
  "i18n-ally.annotationDelimiter": ".",
  "i18n-ally.keystyle": "flat",
  "i18n-ally.dirStructure": "dir",
  "i18n-ally.displayLanguage": "en",
  "i18n-ally.extract.keygenStrategy": "slug",
  "i18n-ally.extract.keygenStyle": "snake_case",
  "i18n-ally.enabledFrameworks": ["react-i18next"],
  "i18n-ally.extract.autoDetect": true,
  "i18n-ally.namespace": true,
  "i18n-ally.pathMatcher": "{locale}/{namespace}.json",
}
```

