# oauth

Standalone OAuth 2.1 authorization server: `node-oidc-provider` on the app origin under `/oauth`, issuing the
access tokens the API and the MCP endpoint accept.

All authorization server code lives in `backend/src/modules/oauth-server/`; the process entry is
`backend/src/modules/oauth-server/worker/oauth-worker-entry.ts`.

## File structure

```
oauth/src
└── oauth-worker.ts    Entry point (sets MODE, loads backend)
```

## Scripts

```sh
pnpm dev          # Development with watch mode
pnpm start:dev    # Run with tsx (no build)
```
