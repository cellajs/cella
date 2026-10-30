# Measuring CSS

Headless Chromium through Playwright, as [verify](../verify/SKILL.md#drive-browser) drives it. Safari and Firefox stay unmeasured, and invalidation may differ there, so a selector rewrite that matters also gets a look in Safari on a device.

## Find the cost

1. **Element counts first.** `UpdateLayoutTree.args.elementCount` in a `devtools.timeline` trace, against the page's element count. Counts repeat exactly whatever the machine load, and no throttle is needed. `flip-scan.mjs` does this for body and html classes.
2. **Then the trigger.** Add the category `disabled-by-default-devtools.timeline.invalidationTracking` and read `ScheduleStyleInvalidationTracking` and `StyleRecalcInvalidationTracking` for the flip and the node behind each big recalc. This found one class that makes every `:last-child` flip restyle a subtree, which no reading of the CSS shows.
3. **Selector statistics last.** The category `disabled-by-default-blink.debug` gives `SelectorStats`. Use `match_attempts`, `match_count` and `fast_reject_count`: attempts equal to the element count with no fast rejects and no matches names a selector worth testing. Ignore `elapsed`, which swings between runs. The tracing adds 20x to 47x overhead, so never time with it on, and it sees matching only, not invalidation, where the largest costs sit.

Statistics on the stylesheet alone confirm nothing: they point at `@property`, `:has()` and prose rules, which are all cheap here.

## Prove a gain

- **Paired before and after in one page**, by replacing the text of the `<style data-vite-dev-id>` element at runtime, or a variable or class in the DOM. Shuffle the order per round, since the first mode runs slower.
- **Keep a no-op control** (an A/A pair, or a page the change cannot affect). Under machine load the control itself can move by 10%.
- **Report element count, longest event and total.** Totals overlap where the longest event does not.
- **`tdur` over `dur`**: `dur` moves with load. Under `Emulation.setCPUThrottlingRate` (4x), `tdur` still includes the slowdown. A gain under about 10% needs 7 rounds and a count of how many went the same way.
- **Prove the patch took effect** by its element count. A bad regex looks like no effect, and a bad layout looks like a win: a fixture whose rows collapse to 35px stops being hit by hover.

## Fixtures

Rank at the real rendered count, not at 1,000 rows: a large gain at that scale can vanish on a virtualized table of 20. To isolate one variable, snapshot a real row's `outerHTML`, clone it N times under the real parent with the app's compiled CSS, and on every run assert row width, cell positions and `elementFromPoint`. Confirm the result on the real page.

## Traps

- Reading computed style on `html` does not flush a body subtree, and reads as 0 ms. Force it on an element inside, or trace frames.
- `RecalcStyleDuration` and `LayoutDuration` alone rank wrongly: `Layerize` can be most of a hover frame, and shows only in a trace. Report task time too, and use a device scale factor of 2 or more, since 1 understates `Layerize`.
- `:hover` does not behave like an attribute under `:is(X *)`, so test it with a real mouse.
- Dev tools in the DOM inflate counts: the TanStack devtools were about 1,200 of 1,632 elements on one page.
- `will-change-transform` or `backdrop-blur` on rows look like a large win on the main thread. The work has probably moved to the compositor, which this does not measure.
- The dev build inflates the JS share of a frame. Absolute times do not carry over to production; selector shapes do.
