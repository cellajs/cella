---
name: android-emulator
description: Reproduce and verify phone bugs on real Android Chrome with the real on-screen keyboard. Use when a bug or a change involves the on-screen keyboard, the visual viewport, editing text on a phone, sticky or fixed UI on a phone, or real touch scrolling. Desktop Chromium with a phone viewport shows none of these.
---

# Android emulator

Desktop Chromium has no on-screen keyboard. On a phone the keyboard only shrinks the visual viewport, while sticky and fixed UI stays pinned to the larger layout viewport, and scrolling pans one over the other. Reproduce that kind of bug here, before guessing at it from the code.

- `emulator.sh`: installs, starts and stops a headless Pixel 7 with Chrome and Gboard.
- `edit-driver.mjs`: edits text with real taps and typing, and reports whatever stays pinned over the page.

## Set up

The first install downloads about 4 GB into `~/Library/Android` and accepts the Android SDK licences. **Ask the user before you run it.** It only targets macOS on Apple silicon. It needs no Homebrew and changes nothing outside that folder and the emulator's `~/.android`.

```sh
bash cella/skills/android-emulator/emulator.sh install
bash cella/skills/android-emulator/emulator.sh start        # boots in under a minute, no window
bash cella/skills/android-emulator/emulator.sh stop         # frees 4 GB of memory when you are done
```

`start --wipe` boots from a factory state, for when Chrome's state gets in the way. To remove everything, stop it and delete `~/Library/Android` and `~/.android/avd/cella-phone.*`.

## Run

With a healthy dev stack in the checkout under test ([verify, Launch](../verify/SKILL.md#launch)), from the repo root:

```sh
node cella/skills/android-emulator/edit-driver.mjs \
  --email <user> --path <app path> --editor '.bn-container' \
  --tap '<selector to reach the editor>' --leave '<selector that leaves it>' --out <scratch>/emulator
```

| Option | Meaning |
|---|---|
| `--email` | The user to sign in, through `session:mint` |
| `--path` | The page to open. The driver forwards this checkout's port, so a linked worktree works too |
| `--editor` | What to tap to focus the editor. Tapped up to three times, as a first tap may only expand the card holding it |
| `--tap` | Taps before that, one flag per step, such as a button that opens a form |
| `--leave` | How a user leaves the editor. The driver scrolls to it first. Left out, it blurs from script, which proves less |
| `--lines` | Lines to type, 30 by default. `0` types nothing, needed for a single-line input, where Enter submits |
| `--ignore` | Selector for pinned UI that is meant to stay, such as a dev-only banner |
| `--out` | Folder for one screenshot per step and `rows.json` |

The run focuses the editor, types, swipes both ways, presses back, which closes the keyboard but keeps the focus, swipes again, then leaves the editor. It exits 1 when something floats while the editor has focus, or when the editor never took focus.

**Typing writes.** `--lines` types `ZZline<n>ZZ` into whatever has focus, and a collaborative description saves it to the database at once. Prefer a form that has not been submitted. If it has to be a real row, back it up first and clean up afterwards, including its `yjs_documents` and `yjs_updates` rows.

## Read the output

```
swipe-down-2         y=1724   view=471+312/783 kb=1 edit=1 [] floating: [data-sticky]@0
```

- `view=471+312/783`: 471 px visible, panned 312 px down the layout viewport, which is 783 px tall. A keyboard is up when the first number is well below the last.
- `kb`: the keyboard is up, measured here. `edit`: a text field has focus. The brackets show the `keyboard-open` and `text-editing` classes on `<body>`, where the app has them. `kb=1` with empty brackets means the app missed the keyboard.
- `floating`: pinned elements with painted content inside the visible area, with their position. The scan covers every sticky and fixed element, so a new bar needs no new selector. A bar resting in its own place in the flow does not count.
- `in an overlay`: pinned content inside a `[role=dialog]`. Listed, but it does not fail the run. A fixed layer over the whole screen, a modal or its backdrop, is left out altogether.

Before you trust a pass, look at two screenshots from `--out`: the first with the keyboard up, and the one after pressing back. Then check the pass means something: run it once against the code before your fix, and expect it to fail.

## Gotchas

- `adb exec-out screencap -p` shows the keyboard, a CDP screenshot does not. The driver uses the first.
- The emulator's Chrome keeps the app's offline cache, so it can show text the database no longer holds. Check a cleanup in a fresh browser.
- Stray `input text` on a page with no editor reaches the app's hotkeys, which is why the driver stops when the editor has no focus.
- Keep selectors out of the editor's content when aiming for a control: a checkbox in a description is a real write when tapped.
- The image ships an older Chrome than a current phone. Keyboard and viewport behavior is the same since Chrome 108, but do a final check on a real device for anything visual.
- iOS Safari is not covered here. Playwright's WebKit has no on-screen keyboard either, so that takes a real iPhone.
