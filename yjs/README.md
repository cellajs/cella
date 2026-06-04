# yjs

Standalone WebSocket relay for real-time collaborative editing via the Yjs CRDT protocol.

Clients connect with an HMAC-signed token. The server verifies the token, checks entity access via the backend, then relays binary Yjs sync and awareness messages between peers. It never parses Y.Doc content — it stores and forwards raw `Uint8Array` state. Document state is persisted to PostgreSQL (with RLS) and cleaned up after a grace period once all clients disconnect.

## File structure

```
yjs/src
├── yjs-worker.ts               Entry point
├── constants.ts                 Tuning defaults
├── env.ts                       Zod env variables
├── server
│   ├── ws-server.ts             HTTP + WS server lifecycle
│   ├── upgrade.ts               WS upgrade (param validation, auth, access)
│   ├── auth.ts                  HMAC token verification + backend access check
│   └── health.ts                HTTP health endpoint
├── sync
│   ├── relay.ts                 Binary y-protocols message relay
│   └── session-manager.ts       Active connections per doc, cleanup timers
├── data
│   ├── storage.ts               Y.Doc state CRUD against yjs_documents table
│   └── db.ts                    PG pool with RLS context helper
├── lib
│   ├── pino.ts                  Structured logger
│   └── tracing.ts               OpenTelemetry SDK + health metrics
└── tests/
```

## Connection lifecycle

1. Client connects: `ws://host:port/{entityId}?token=...&entityType=...`
2. Server verifies HMAC token, then calls backend to verify entity access
3. Connection joins a `CollabSession` in the session manager
4. Sync/update messages are relayed to peers and debounce-saved to PG
5. Awareness (cursor/presence) messages are rate-limited and broadcast
6. On disconnect, a grace period runs before deleting stored state

**WS close codes:** `4001` invalid token · `4003` access denied · `4400` bad request · `4503` backend unavailable

## Scripts

```sh
pnpm dev          # Development with watch mode
pnpm build        # Production build via tsup
pnpm start        # Run production build
pnpm start:dev    # Run with tsx (no build)
pnpm ts           # Type-check
pnpm test         # Run tests
pnpm test:watch   # Run tests in watch mode
```


