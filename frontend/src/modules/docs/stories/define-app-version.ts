// The Storybook test build has no __APP_VERSION__ define, and docs/query.ts reads it at import time.
(globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ ??= 'storybook';
