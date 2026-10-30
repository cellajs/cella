import { chromium, endSession, mintSession } from '../../two-tab-sync-test/driver-lib.mjs';
import { printHeader } from './lib.mjs';

// Finds controls a touch user cannot see and can still tap: `hover:` never fires on touch and `opacity-0` does not stop a tap.
// Emulated touch in Chromium, so a hit still gets a look on a real phone.
// Run from the repo root: node touch-probe.mjs <origin> [--session <email>] <path> [<path> ...]
const args = process.argv.slice(2);
const sessionAt = args.indexOf('--session');
const email = sessionAt >= 0 ? args.splice(sessionAt, 2)[1] : undefined;
const [origin, ...paths] = args;
if (!origin || !paths.length) {
  console.error('usage: node touch-probe.mjs <origin> [--session <email>] <path> [<path> ...]');
  process.exit(2);
}

function invisibleControls() {
  const opacity = (element) => {
    let result = 1;
    for (let at = element; at && at !== document.documentElement; at = at.parentElement) result *= Number.parseFloat(getComputedStyle(at).opacity);
    return result;
  };
  const found = [];
  for (const element of document.querySelectorAll('a[href],button,[role=button],[role=link],input,select,textarea,[tabindex]')) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (rect.width < 4 || rect.height < 4 || style.visibility === 'hidden' || style.pointerEvents === 'none' || opacity(element) >= 0.05) continue;
    found.push(
      `${element.tagName.toLowerCase()} "${element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 30)}" ${String(element.className).slice(0, 70)}`,
    );
  }
  return found;
}

printHeader();
const session = email ? mintSession(email) : undefined;
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  if (session) await context.addCookies([session.cookie]);
  const page = await context.newPage();
  for (const path of paths) {
    await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const first = await page.evaluate(invisibleControls);
    // A second read a moment later drops a control that was only fading in.
    await page.waitForTimeout(1000);
    const second = new Set(await page.evaluate(invisibleControls));
    const counts = {};
    for (const control of first.filter((item) => second.has(item))) counts[control] = (counts[control] ?? 0) + 1;
    console.info(`\n${path}: ${Object.keys(counts).length} kinds`);
    for (const [control, count] of Object.entries(counts)) console.info(`  ${count}x ${control}`);
  }
} finally {
  await browser.close();
  await endSession(session);
}
