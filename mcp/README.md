# mcp

Standalone MCP worker exposing the server tool registry to external clients.

A thin entrypoint: it sets `MODE=mcp` and imports the backend main module. All MCP worker code lives in `backend/src/modules/mcp/worker/`.

## File structure

```
mcp/src
└── mcp-worker.ts    Entry point (sets MODE, loads backend)
```

## Scripts

```sh
pnpm dev          # Development with watch mode
pnpm build        # Production build via tsup
pnpm start        # Run production build
pnpm start:dev    # Run with tsx (no build)
pnpm ts           # Type-check
```
