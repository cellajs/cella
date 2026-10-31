// Edits text on real Android Chrome and reports anything left pinned over the page while the editor has focus. See SKILL.md for the options.
// Run from the repo root, after emulator.sh start. Exits 1 when something floats while editing, or when the editor never took focus.
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, endSession, mintSession } from '../two-tab-sync-test/driver-lib.mjs';

const { values: args } = parseArgs({
  options: {
    email: { type: 'string' },
    path: { type: 'string' },
    editor: { type: 'string' },
    tap: { type: 'string', multiple: true, default: [] },
    leave: { type: 'string' },
    lines: { type: 'string', default: '30' },
    ignore: { type: 'string' },
    out: { type: 'string', default: 'android-emulator-shots' },
  },
});
if (!args.email || !args.path || !args.editor) throw new Error('--email, --path and --editor are required: see SKILL.md.');

const ADB = `${process.env.ANDROID_ROOT ?? `${process.env.HOME}/Library/Android`}/sdk/platform-tools/adb -e`;
const adb = (command) => execSync(`${ADB} ${command}`, { encoding: 'buffer', maxBuffer: 1 << 26 });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
mkdirSync(args.out, { recursive: true });

const session = mintSession(args.email);
const port = new URL(session.base).port;
adb(`reverse tcp:${port} tcp:${port}`);
adb('forward tcp:9222 localabstract:chrome_devtools_remote');

const browser = await chromium.connectOverCDP('http://localhost:9222');
const context = browser.contexts()[0];
await context.addCookies([session.cookie]);
const page = context.pages()[0] ?? (await context.newPage());
page.setDefaultTimeout(45000);

const [, screenHeight] = /(\d+)x(\d+)/.exec(adb('shell wm size').toString()).slice(1).map(Number);
const finger = (part) => Math.round(screenHeight * part);
const swipe = (from, to) => adb(`shell input swipe 540 ${finger(from)} 540 ${finger(to)} 350`);

// Where the page starts on the physical screen: a real tap, read back. It needs a viewport meta, or the page runs at 980px wide.
await page.goto('about:blank');
await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><body style="height:100vh;margin:0">');
await sleep(800);
await page.evaluate(() => {
  addEventListener('pointerdown', (event) => {
    window.calibration = { y: event.clientY, dpr: devicePixelRatio, innerHeight };
  });
});
adb(`shell input tap 540 ${finger(0.5)}`);
await sleep(500);
const calibration = await page.evaluate(() => window.calibration);
if (!calibration) throw new Error('The calibration tap never reached the page: look at a screenshot for a dialog in the way.');
const { dpr } = calibration;
// The toolbar comes and goes with scrolling, so taps count from the bottom of the page, which stays put
const pageBottom = finger(0.5) + (calibration.innerHeight - calibration.y) * dpr;
const tapPoint = async (x, y) => {
  const height = await page.evaluate(() => innerHeight);
  adb(`shell input tap ${Math.round(x * dpr)} ${Math.round(pageBottom - (height - y) * dpr)}`);
};

await page.goto(new URL(args.path, session.base).href, { waitUntil: 'domcontentloaded' });
await page.waitForSelector(args.tap[0] ?? args.editor);
await sleep(3000);

const scan = (ignore) => {
  const view = visualViewport;
  const viewTop = view.offsetTop;
  const viewBottom = viewTop + view.height;
  const active = document.activeElement;
  const shows = (element) => element.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  const isOpaque = (color) => !/^(transparent|rgba\(.*, 0\)|rgba\(0, 0, 0, 0\))$/.test(color) && !color.endsWith(' / 0)');

  // A bar can stay in place with its content slid out of view, so what counts is painted content inside the bar's own box
  const painted = (bar) => {
    const box = bar.getBoundingClientRect();
    return [bar, ...bar.querySelectorAll('*')].some((node) => {
      if (!shows(node)) return false;
      const rect = node.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      const inBox = rect.bottom > box.top + 1 && rect.top < box.bottom - 1;
      const inView = rect.bottom > viewTop + 1 && rect.top < viewBottom - 1;
      if (!inBox || !inView) return false;
      const hasText = [...node.childNodes].some((child) => child.nodeType === 3 && child.textContent.trim());
      return hasText || node.tagName === 'svg' || node.tagName === 'IMG' || isOpaque(getComputedStyle(node).backgroundColor);
    });
  };

  // Sticky only pins once its place has moved away, which shows as an overlap with a neighbor in the flow
  const pinned = (element, position) => {
    if (position === 'fixed') return true;
    const box = element.getBoundingClientRect();
    const next = element.nextElementSibling?.getBoundingClientRect();
    const previous = element.previousElementSibling?.getBoundingClientRect();
    return (!!next && next.height > 0 && next.top < box.bottom - 1) || (!!previous && previous.height > 1 && previous.bottom > box.top + 1);
  };

  const name = (element) => {
    if (element.id) return `#${element.id}`;
    const data = element.getAttribute('data-slot') ?? [...element.attributes].find((attribute) => attribute.name.startsWith('data-'))?.name;
    if (data) return `[${data}]`;
    return `${element.tagName.toLowerCase()}.${[...element.classList].slice(0, 2).join('.')}`;
  };

  const floating = [];
  const overlays = [];
  for (const element of document.querySelectorAll('body *')) {
    const { position } = getComputedStyle(element);
    if (position !== 'fixed' && position !== 'sticky') continue;
    // A sheet that holds the editor is fixed itself, and its own sticky headers scroll with it, not with the page
    if (element.contains(active) || (ignore && element.closest(ignore))) continue;
    // A layer over the whole screen is a modal and its backdrop, not UI floating over the page
    const box = element.getBoundingClientRect();
    if (position === 'fixed' && box.width >= innerWidth && box.height >= innerHeight) continue;
    if (!pinned(element, position) || !painted(element)) continue;
    const entry = `${name(element)}@${Math.round(box.top)}`;
    if (element.closest('[role=dialog]')) overlays.push(entry);
    else floating.push(entry);
  }

  const editing = !!active && (active.isContentEditable || ['TEXTAREA', 'INPUT'].includes(active.tagName));
  return {
    y: Math.round(scrollY),
    innerHeight,
    viewHeight: Math.round(view.height),
    viewTop: Math.round(viewTop),
    keyboardUp: innerHeight - view.height >= 100,
    bodyClasses: ['keyboard-open', 'text-editing'].filter((name) => document.body.classList.contains(name)),
    editing,
    floating,
    overlays,
  };
};

const rows = [];
const check = async (step) => {
  await sleep(700);
  const row = { step, ...(await page.evaluate(scan, args.ignore)) };
  rows.push(row);
  const viewport = `view=${row.viewHeight}+${row.viewTop}/${row.innerHeight}`;
  const flags = `kb=${row.keyboardUp ? 1 : 0} edit=${row.editing ? 1 : 0} [${row.bodyClasses.join(' ')}]`;
  console.log(`${step.padEnd(20)} y=${String(row.y).padEnd(6)} ${viewport} ${flags} floating: ${row.floating.join(' ') || 'none'}`);
  if (row.overlays.length) console.log(`${''.padEnd(20)} in an overlay: ${row.overlays.join(' ')}`);
  // adb, not CDP: a CDP screenshot leaves the keyboard out
  writeFileSync(join(args.out, `${String(rows.length).padStart(2, '0')}-${step}.png`), adb('exec-out screencap -p'));
  return row;
};

const tapSelector = async (selector) => {
  const point = await page.evaluate((selector) => {
    const matches = [...document.querySelectorAll(selector)].filter((node) => node.getBoundingClientRect().width > 0);
    const onScreen = matches.find((node) => {
      const rect = node.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < visualViewport.offsetTop + visualViewport.height;
    });
    const element = onScreen ?? matches[0];
    if (!element) return null;
    if (!onScreen) element.scrollIntoView({ block: 'center', behavior: 'instant' });
    const rect = element.getBoundingClientRect();
    return { x: rect.left + Math.min(rect.width / 2, 120), y: Math.max(rect.top, 0) + Math.min(rect.height / 2, 30) };
  }, selector);
  if (!point) throw new Error(`Nothing visible matches ${selector}`);
  await tapPoint(point.x, point.y);
};

const finish = async (code) => {
  writeFileSync(join(args.out, 'rows.json'), JSON.stringify(rows, null, 1));
  await browser.close();
  await endSession(session);
  process.exit(code);
};

await check('rest');
for (const selector of args.tap) {
  await tapSelector(selector);
  await sleep(2000);
}

// A first tap may only expand what holds the editor
for (let attempt = 0; attempt < 3; attempt++) {
  if (await page.evaluate(() => document.activeElement?.isContentEditable || ['TEXTAREA', 'INPUT'].includes(document.activeElement?.tagName))) break;
  await tapSelector(args.editor);
  await sleep(2500);
}
const first = await check('editor-focused');
if (!first.editing) {
  console.log('ABORT: the editor never took focus. Nothing below this line was tested.');
  await finish(1);
}

const lines = Number(args.lines);
for (let line = 1; line <= lines; line++) {
  adb(`shell input text ZZline${line}ZZ`);
  adb('shell input keyevent 66');
  await sleep(120);
}
if (lines) await check(`typed-${lines}`);

// With the keyboard up the page shows in the top half of the screen, so the finger stays there
swipe(0.38, 0.21);
await check('swipe-down-1');
swipe(0.38, 0.21);
await check('swipe-down-2');
swipe(0.21, 0.38);
await check('swipe-up-1');
swipe(0.21, 0.38);
await check('swipe-up-2');
swipe(0.38, 0.21);
await check('swipe-down-3');

adb('shell input keyevent 4');
await sleep(1200);
await check('back-keyboard-closed');
swipe(0.62, 0.38);
await check('closed-swipe-down');
swipe(0.38, 0.62);
await check('closed-swipe-up');

if (args.leave) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const reachable = await page.evaluate((selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return !rect || (rect.top >= 0 && rect.bottom < innerHeight - 20);
    }, args.leave);
    if (reachable) break;
    swipe(0.33, 0.71);
    await sleep(500);
  }
  await tapSelector(args.leave);
} else {
  await page.evaluate(() => document.activeElement?.blur());
}
await sleep(1500);
const left = await check('left-editor');
swipe(0.62, 0.46);
await check('after-swipe-down');
swipe(0.46, 0.67);
await check('after-swipe-up');

const editingRows = rows.filter((row) => row.editing);
const floated = editingRows.filter((row) => row.floating.length);
const keyboardMisread = editingRows.filter((row) => row.keyboardUp && row.bodyClasses.length === 0);
console.log(`\nVERDICT: ${editingRows.length} steps with the editor focused, ${floated.length} with something floating, ${keyboardMisread.length} with the keyboard up and no body class`);
if (left.editing) console.log('NOTE: the editor still had focus after leaving it.');
await finish(floated.length || left.editing ? 1 : 0);
