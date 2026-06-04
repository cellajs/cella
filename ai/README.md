# ai

Standalone AI worker for streaming chat, tools, and background jobs.

Thin entrypoint that delegates to `backend/src/modules/ai/worker/`. Sets `MODE=ai-worker` and imports the backend main module, so all AI logic lives in the backend codebase.

## File structure

```
ai/src
└── ai-worker.ts    Entry point (sets MODE, loads backend)
```

All AI worker code lives in `backend/src/modules/ai/worker/`.

## Scripts

```sh
pnpm dev          # Development with watch mode
pnpm build        # Production build via tsup
pnpm start        # Run production build
pnpm start:dev    # Run with tsx (no build)
pnpm ts           # Type-check
```
