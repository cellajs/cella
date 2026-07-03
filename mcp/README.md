# mcp

Standalone MCP worker exposing the server tool registry to external clients.

Thin entrypoint that delegates to `backend/src/modules/mcp/worker/`. Sets `MODE=mcp-worker` and imports the backend main module, so all MCP logic lives in the backend codebase.

## File structure

```
mcp/src
└── mcp-worker.ts    Entry point (sets MODE, loads backend)
```

All MCP worker code lives in `backend/src/modules/mcp/worker/`.

## Scripts

```sh
pnpm dev          # Development with watch mode
pnpm build        # Production build via tsup
pnpm start        # Run production build
pnpm start:dev    # Run with tsx (no build)
pnpm ts           # Type-check
```
