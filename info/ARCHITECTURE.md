# Cella Architecture
This document describes the high-level architecture of Cella.

These are the core concepts:
 1. Only build what you are going to use yourself.
 2. Stay humble and remain a template, not a framework. So prevent abstraction layers.
 3. A single, opinionated stack: ie. Cella uses Drizzle ORM and will not make it replacable with another ORM.
 4. Modularity. As CellaJS will grow, we need to make sure you can scaffold only the modules that you need.
 5. Open standards. Our long term vision is that each Cella - as in each cell - can speak fluently with other cells. 

### Backend
- [Hono](https://hono.dev) + [NodeJS](https://nodejs.org)
- [Postgres](https://www.postgresql.org) + [Drizzle ORM](https://orm.drizzle.team/)
- [Zod](https://github.com/colinhacks/zod)
- [OpenAPI](https://www.openapis.org)
- [Lucia Auth](https://lucia-auth.com/)
- [React Email](https://react.email/)

### Frontend
- [React](https://reactjs.org)
- [Tanstack Router](https://github.com/tanstack/router)
- [Tanstack Query](https://github.com/tanstack/query)
- [Zustand](https://github.com/pmndrs/zustand)

### UI
- [Shadcn UI](https://ui.shadcn.com)
- [I18next](https://www.i18next.com)
- [Lucide icons](https://lucide.dev)

### Build tools
- [Vite](https://vitejs.dev) + [Vite-PWA](https://github.com/antfu/vite-plugin-pwa)
- [Turborepo](https://turborepo.dev) + [pnpm](https://pnpm.io)
- [Biome](https://biomejs.dev)
- [Lefthook](https://github.com/evilmartians/lefthook)

### 3rd party integrations
- SimpleLocalize
- AppSignal
- ... more to come

## File structure
coming soon, will still change into a more modular structure.

## API Design
An OpenAPI is built using Hono middleware called [zod-openapi](https://github.com/honojs/middleware/tree/main/packages/zod-openapi). Please read the readme in this middleware before you get started.

## Security

Link to valuable resources:
* https://mvsp.dev/mvsp.en/
 