---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: openMenu, data-archived-visible, toggle debug toolbar
---

# The shots config folds the menu's archived rows through their current markup

An app whose `shots-config.mjs` copied `openMenu` times out on any shot with the menu open. Replace its archived-rows step, and hide development UI with a stylesheet.

## What & why

The archived toggle sits one element deeper than `openMenu` selected, so the fold found no button and the shot failed after 30 seconds. The new step also survives the list shrinking on each fold. The driver now waits out the nav button's logo intro and until spinners stop, so an app's `open` only waits for what its own page fills in last.

## Blast radius

`cella/skills/screenshots/shots-config.mjs`, which an app pins. Only the screenshot run is affected: no app code, database or cache.

## Run

No script: manual.

## Manual steps

1. If your config has `openMenu`, replace its archived-rows loop and the `waitFor` after it with:
   ```js
   const unfolded = page.locator('#nav-sheet li[data-archived-visible="true"][data-has-archived="true"] > div button');
   while (await unfolded.count()) await unfolded.first().click();
   ```
2. Hide development UI through `page.addStyleTag`, so an element that renders after `open` stays hidden: the debug button, and `#nav-sheet .animate-status-pulse` on a stack without every service.
3. In a shot of a table, wait for the column that fills in last before the shot.

## Verify

```sh
START= OUT_DIR=/tmp/shots node cella/skills/screenshots/shot-driver.mjs
```
