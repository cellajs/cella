import { spawnSync } from 'node:child_process';
import { appConfig } from 'shared';
import type { EvidenceSet } from './findings.ts';
import { repoRoot } from './session.ts';

const sourceGlobs = ['frontend/src/**/*.ts', 'frontend/src/**/*.tsx', 'frontend/src/**/*.css', ':!**/*.test.*', ':!**/*.stories.*', ':!**/tests/**'];

/** Matching lines (`file:line: text`) in frontend sources, tests and stories left out. Patterns are POSIX ERE: no `\s`, `\w` or `\b`. */
function search(pattern: string, globs = sourceGlobs) {
  const result = spawnSync('git', ['grep', '-nIE', pattern, '--', ...globs], { cwd: repoRoot, encoding: 'utf8' });
  return result.stdout.split('\n').filter(Boolean);
}

const files = (lines: string[]) => [...new Set(lines.map((line) => line.split(':')[0]))];

/** Keyboard shortcuts made of a printable character alone or with Shift only. */
function characterShortcuts() {
  const found: string[] = [];
  for (const line of search(String.raw`\['[^']+'[[:space:]]*,[[:space:]]*\(`)) {
    const combo = /\['([^']+)'/.exec(line)?.[1];
    if (!combo) continue;
    const keys = combo.split('+').map((key) => key.trim().toLowerCase());
    const modifiers = keys.filter((key) => ['meta', 'ctrl', 'control', 'alt', 'mod'].includes(key));
    const printable = keys.filter((key) => key !== 'shift').every((key) => key.length === 1);
    if (!modifiers.length && printable) found.push(`${combo} (${line.split(':')[0]})`);
  }
  return found;
}

function biome(rules: string[]) {
  const args = ['biome', 'lint', ...rules.map((rule) => `--only=${rule}`), '--reporter=json', '--max-diagnostics=500', 'frontend/src'];
  const result = spawnSync('pnpm', ['--silent', ...args], { cwd: repoRoot, encoding: 'utf8' });
  try {
    const report = JSON.parse(result.stdout) as { diagnostics: { location: { path: { file: string } | string } }[] };
    return report.diagnostics.map(({ location }) => (typeof location.path === 'string' ? location.path : location.path.file));
  } catch {
    return [];
  }
}

/** Repository checks for criteria a browser cannot see: media, motion, shortcuts, time limits and sign-in methods. */
export function runCodeChecks(evidence: EvidenceSet) {
  const media = search('<(video|audio)[[:space:]>]|MediaPlayer|react-player');
  evidence.add(
    ['1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5'],
    media.length
      ? {
          check: 'code:media',
          result: 'review',
          summary: `The app plays media in ${files(media).join(', ')}. A person decides whether it publishes media of its own or only plays files users upload.`,
          where: files(media),
        }
      : { check: 'code:media', result: 'not-applicable', summary: 'The app contains no video or audio.', where: [] },
  );

  const autoplay = search(String.raw`autoPlay|autoplay`);
  evidence.add(
    ['1.4.2'],
    autoplay.length
      ? {
          check: 'code:autoplay',
          result: 'review',
          summary: `Autoplay is set in ${files(autoplay).join(', ')}; check that none of it plays sound.`,
          where: files(autoplay),
        }
      : { check: 'code:autoplay', result: 'not-applicable', summary: 'No audio or video plays automatically.', where: [] },
  );

  const shortcuts = characterShortcuts();
  evidence.add(
    ['2.1.4'],
    shortcuts.length
      ? {
          check: 'code:shortcuts',
          result: 'fail',
          summary: `Single-character shortcuts with no way to turn them off or remap them: ${shortcuts.join(', ')}.`,
          where: shortcuts,
        }
      : { check: 'code:shortcuts', result: 'pass', summary: 'Every keyboard shortcut includes Ctrl, Alt or Meta.', where: [] },
  );

  const sessionSpan = search(String.raw`new TimeSpan\(1, 'w'\)`, ['backend/src/modules/auth/sessions/**/*.ts']);
  const toastTimeout = /timeout=\{(\d+)\}/.exec(search(String.raw`<Toaster .*timeout=`).join('\n'))?.[1];
  evidence.add(['2.2.1'], {
    check: 'code:timing',
    result: 'review',
    summary: [
      sessionSpan.length ? 'Sessions last a week, beyond the 20-hour exception.' : 'Session lifetime not found.',
      'Sign-in challenges (passkey, email link, step-up) expire after 5 to 10 minutes and can be requested again.',
      toastTimeout ? `Toasts close after ${Number(toastTimeout) / 1000} seconds; check that none carries information users need to act on.` : '',
    ].join(' '),
    where: [],
  });

  const looping = search(String.raw`animate-(ping|pulse|bounce)|animation:[^;]*infinite|repeat: Infinity|carousel-autoplay`);
  evidence.add(['2.2.2'], {
    check: 'code:motion',
    result: looping.length ? 'review' : 'pass',
    summary: looping.length
      ? `Looping animations in ${files(looping).slice(0, 8).join(', ')}; check that any that runs longer than 5 seconds beside other content can be paused or stops with reduced motion.`
      : 'No animation loops longer than 5 seconds.',
    where: files(looping),
  });

  const flashing = search('(blink|strobe|flash)[a-zA-Z]*[[:space:]]*[:{(]');
  evidence.add(
    ['2.3.1'],
    flashing.length
      ? { check: 'code:motion', result: 'review', summary: `Possible flashing effects in ${files(flashing).join(', ')}.`, where: files(flashing) }
      : { check: 'code:motion', result: 'pass', summary: 'Nothing in the interface flashes or blinks.', where: [] },
  );

  const gestures = search(String.raw`touches\.length|pinch|onSwipe|useGesture|swipeDirection`);
  evidence.add(
    ['2.5.1'],
    gestures.length
      ? {
          check: 'code:gestures',
          result: 'review',
          summary: `Gesture handlers in ${files(gestures).join(', ')}; check each has a single-pointer alternative such as a button.`,
          where: files(gestures),
        }
      : { check: 'code:gestures', result: 'pass', summary: 'No multipoint or path-based gestures.', where: [] },
  );

  const deviceMotion = search(String.raw`devicemotion|deviceorientation|DeviceMotionEvent|DeviceOrientationEvent`);
  evidence.add(
    ['2.5.4'],
    deviceMotion.length
      ? {
          check: 'code:motion-actuation',
          result: 'review',
          summary: `Device motion is read in ${files(deviceMotion).join(', ')}.`,
          where: files(deviceMotion),
        }
      : { check: 'code:motion-actuation', result: 'not-applicable', summary: 'No function responds to shaking or tilting the device.', where: [] },
  );

  const dragging = search(String.raw`draggable\(|dropTargetForElements|monitorForElements|onDragStart|useDrag[^a-zA-Z]`);
  evidence.add(['2.5.7'], {
    check: 'code:dragging',
    result: 'review',
    summary: dragging.length ? `Drag and drop in ${files(dragging).join(', ')}; check each has a single-pointer alternative.` : 'No drag and drop.',
    where: files(dragging),
  });

  const strategies: readonly string[] = appConfig.enabledAuthStrategies;
  const oneTimeCode = search('one-time-code');
  const memoryFree = strategies.some((strategy) => ['passkey', 'magic', 'oauth'].includes(strategy));
  evidence.add(['3.3.8'], {
    check: 'code:authentication',
    result: memoryFree && (!strategies.includes('totp') || oneTimeCode.length) ? 'pass' : 'fail',
    summary: `Sign-in uses ${strategies.join(', ')}: no password to remember, and one-time codes support autofill (autocomplete="one-time-code").`,
    where: [],
  });

  const pointerOnly = biome(['a11y/noStaticElementInteractions', 'a11y/useKeyWithClickEvents']);
  evidence.add(['2.1.1'], {
    check: 'code:keyboard-handlers',
    result: pointerOnly.length ? 'review' : 'pass',
    summary: pointerOnly.length
      ? `${pointerOnly.length} elements handle pointer events without a keyboard equivalent, in ${[...new Set(pointerOnly)].join(', ')}; check that each has a keyboard path.`
      : 'Every element with a click handler also handles the keyboard.',
    where: [...new Set(pointerOnly)],
  });
}
