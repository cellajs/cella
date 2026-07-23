import assert from 'node:assert/strict';
import { transformSource } from './sonner-style-toaster-api';

const modulePath = '~/modules/common/toaster/toaster';

const legacy = `
import { toaster as notify } from '${modulePath}';

notify(message, 'success');
notify(
  translate('failed'),
  'error',
  { description: details },
);
notify(message, severity);
`;

const transformed = transformSource(legacy, 'fixture.ts');
assert.equal(transformed.rewrites, 2);
assert.deepEqual(transformed.rewritesBySeverity, { error: 1, success: 1 });
assert.match(transformed.output, /notify\.success\(message\)/);
assert.match(transformed.output, /notify\.error\(translate\('failed'\), \{ description: details \}\)/);
assert.match(transformed.output, /notify\(message, severity\)/);
assert.equal(transformed.skipped.length, 1);
assert.match(transformed.skipped[0].reason, /dynamic second argument/);

const defaults = transformSource(
  `import { toaster } from '${modulePath}';\ntoaster(message, 'default', options);\ntoaster(message, options);`,
  'defaults.ts',
);
assert.match(defaults.output, /toaster\(message, options\);\ntoaster\(message, options\);/);
assert.equal(defaults.rewrites, 1);
assert.equal(defaults.skipped.length, 1);

const unrelated = transformSource(
  `import { toaster } from 'another-package';\ntoaster(message, 'info');`,
  'unrelated.ts',
);
assert.equal(unrelated.output, `import { toaster } from 'another-package';\ntoaster(message, 'info');`);
assert.equal(unrelated.rewrites, 0);

const alreadyMigrated = transformSource(
  `import { toaster } from '${modulePath}';\ntoaster.warning(message);`,
  'migrated.ts',
);
assert.equal(alreadyMigrated.output, `import { toaster } from '${modulePath}';\ntoaster.warning(message);`);
assert.equal(alreadyMigrated.rewrites, 0);

const shadowed = transformSource(
  `import { toaster } from '${modulePath}';\nfunction run(toaster) { toaster(message, 'error'); }`,
  'shadowed.ts',
);
assert.equal(shadowed.rewrites, 0);
assert.match(shadowed.skipped[0].reason, /shadowed/);

const idempotent = transformSource(transformed.output, 'fixture.ts');
assert.equal(idempotent.rewrites, 0);
assert.equal(idempotent.output, transformed.output);

const comments = transformSource(
  `import { toaster } from '${modulePath}';\ntoaster(\n  // Keep this message context.\n  message,\n  'info',\n);`,
  'comments.ts',
);
assert.match(comments.output, /toaster\.info\(\/\/ Keep this message context\.\n  message\)/);

console.info('sonner-style-toaster-api codemod tests passed');
