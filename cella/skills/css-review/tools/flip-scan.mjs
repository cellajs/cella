import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, endSession, mintSession } from '../../two-tab-sync-test/driver-lib.mjs';
import { classSources, printHeader, repoRoot } from './lib.mjs';

// Flips every class the frontend sets on body or html and reports how many elements each flip restyles: the check behind the
// performance pass in passes.md. Element counts repeat exactly, so no throttling or repetition is needed.
// Run from the repo root: node flip-scan.mjs <origin> [--session <email>] <path> [<path> ...]
const args = process.argv.slice(2);
const sessionAt = args.indexOf('--session');
const email = sessionAt >= 0 ? args.splice(sessionAt, 2)[1] : undefined;
const [origin, ...paths] = args;
if (!origin || !paths.length) {
  console.error('usage: node flip-scan.mjs <origin> [--session <email>] <path> [<path> ...]');
  process.exit(2);
}

const flips = new Set();
for (const file of classSources()) {
  const source = readFileSync(join(repoRoot, file), 'utf8');
  for (const [, name] of source.matchAll(/useBodyClass\(\{\s*'([\w-]+)'/g)) flips.add(name);
  for (const [, name] of source.matchAll(/(?:body|documentElement)\.classList\.\w+\('([\w-]+)'/g)) flips.add(name);
}
const noMatchControl = 'zz-control';
flips.add(noMatchControl);

async function restyledElements(cdp, page, flip) {
  const events = [];
  const collect = ({ value }) => events.push(...value);
  cdp.on('Tracing.dataCollected', collect);
  await cdp.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { includedCategories: ['devtools.timeline'] } });
  await page.evaluate(flip);
  await page.waitForTimeout(100);
  const done = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.end');
  await done;
  cdp.off('Tracing.dataCollected', collect);
  return events.filter(({ name }) => name === 'UpdateLayoutTree').reduce((sum, { args: traced }) => sum + (traced?.elementCount ?? 0), 0);
}

printHeader();
const session = email ? mintSession(email) : undefined;
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (session) await context.addCookies([session.cookie]);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  for (const path of paths) {
    await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    const dom = await page.evaluate(() => document.querySelectorAll('*').length);
    console.info(`\n${path} (${page.url()}): ${dom} elements`);
    const lines = [];
    // Flushes on an element inside the body: reading computed style on html alone leaves a body subtree recalc pending.
    const flush = 'getComputedStyle(document.body.lastElementChild ?? document.body).color';
    const rootVariable = `document.documentElement.style.setProperty('--zz-control', String(Math.random())); ${flush}`;
    const everything = await restyledElements(cdp, page, rootVariable);
    for (const name of flips) {
      const count = await restyledElements(cdp, page, `document.body.classList.toggle('${name}'); ${flush}`);
      await page.evaluate(`document.body.classList.toggle('${name}'); ${flush}`);
      lines.push({ name, count });
    }
    if (everything < dom * 0.5) console.info(`  control failed: a root variable restyled only ${everything}, so these counts mean nothing`);
    for (const { name, count } of lines.sort((a, b) => b.count - a.count)) {
      console.info(
        `  ${count >= dom * 0.25 ? 'HIGH' : 'ok  '} ${String(count).padStart(6)}  ${name}${name === noMatchControl ? ' (control: a class nothing reads)' : ''}`,
      );
    }
  }
} finally {
  await browser.close();
  await endSession(session);
}
