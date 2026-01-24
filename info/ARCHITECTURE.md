# Architecture
This document describes the high-level architecture of Cella.

### Target product
* frequent-use or heavy use web applications
* focused on user-generated content that requires some form of authentication/authorization. So either semi-public or private access.
* Requires a great UX on different devices, but native apps are not a direct priority
* Development budget and time is limited
* Fullstack development is seen as beneficial to work effectively and to provide engineering stability. 

### DX aspects
 * Type safe, without overdoing it. 
 * Only build what you are going to use yourself.
 * Prevent abstraction layers and leverage libraries to the fullest extent.
 * A narrow stack: Cella uses Drizzle ORM and will not make it replaceable with another ORM.
 * Focus on proven OpenAPI and React Query patterns.
 * Modularity: As Cella will grow, we need to make sure you can scaffold only the modules that you need.
 * Open standards: Our long-term vision is that each Cella - as in each cell - can speak fluently with other cells.
 * Focused on client-side rendering (CSR) and in future static site generation (SSG). These best support the hybrid idiom to support offline and sync capabilities to reduce 'server dependency'. 

### Backend
- [nodejs](https://nodejs.org)
- [hono](https://hono.dev)
- [postgres](https://www.postgresql.org)
- [drizzle orm](https://orm.drizzle.team/)
- [zod](https://github.com/colinhacks/zod)
- [openapi](https://www.openapis.org)
- [jsx email](https://jsx.email/)

### Frontend
- [react](https://reactjs.org)
- [tanstack router](https://github.com/tanstack/router)
- [tanstack query](https://github.com/tanstack/query)
- [zustand](https://github.com/pmndrs/zustand)

### Frontend / UI
- [react data grid](https://github.com/adazzle/react-data-grid)
- [shadcn](https://ui.shadcn.com)
- [i18next](https://www.i18next.com)
- [lucide icons](https://lucide.dev)

### Build tools
- [pnpm](https://pnpm.io)
- [vite](https://vitejs.dev)
- [vite-pwa](https://github.com/antfu/vite-plugin-pwa)
- [biome](https://biomejs.dev)
- [lefthook](https://github.com/evilmartians/lefthook)
- [pglite](https://pglite.dev/)


## File structure
Cella is a flat-root monorepo. In general we like to prevent deeply nested file stuctures.

```
.
├── backend
|   ├── .db                   Location of db when using pglite
|   ├── emails                Email templates with jsx-email
│   ├── drizzle               DB migrations
│   ├── scripts               Seed scripts and other dev scripts
│   ├── src                   
│   │   ├── db                Connect, table schemas
│   │   ├── lib               3rd part libs & important helpers
│   │   ├── middlewares       Hono middlewares
│   │   ├── modules           Modular distribution of routes, schemas etc
│   │   ├── permissions       Permission/authorization layer
│   │   ├── schemas           Shared Zod schemas
│   │   ├── sync              Sync engine utilities
│   │   └── utils             Reusable functions
├── config                    Shared config: default, development, production
├── frontend                  Frontend SPA
│   ├── public                
│   ├── vite                  Vite-related plugins & scripts
│   ├── src                   
│   │   ├── api.gen           Generated sdk client using openapi.json from backend
│   │   ├── hooks             Generic react hooks
│   │   ├── json              Static JSON
│   │   ├── lib               Library code and core helper functions
│   │   ├── modules           Modular distribution of components
│   │   ├── query             query-client including offline/realtime logic
│   │   ├── routes            Code-based routes
│   │   ├── store             Zustand data stores
│   │   ├── styling           Tailwind styling
│   │   ├── utils             Reusable functions
├── info                      Documentation, changelog, migration plans
└── locales                   Translations
```

## Data modeling
Some of the db tables (check out [/backend/src/db/schema]() ) in cella are an `entity`. Entities can be split in categories:
* `ContextEntityType`: Has memberships (`organization`)
* `ProductEntityType`: Content related, no membership (`attachment`)
* All entities, including `user`: (`user`, `organization`, `attachments`)

The example cella setup has one product entity - `attachments` - and one context: `organizations`. But in a typical app you would have a context entity such as a 'bookclub' and more product entities such as 'books' and 'reviews'.

## API Design
An OpenAPI is built with [zod-openapi](https://github.com/honojs/middleware/tree/main/packages/zod-openapi). Please read the readme in this middleware before you get started. An API reference is created using [scalar](https://github.com/scalar/scalar).

## Modularity
Both frontend and backend have business logic split in modules. Most of them are in both backend and frontend, such as `authentication`, `users` and `organizations`. The benefit of modularity is twofold: better code (readability, portability etc) and to pull upstream cella changes with less friction.

Zooming in on some of the frontend modules:
* `common`: a large set of reusable react components and services 
* `ui`: Full of shadcn UI components. They have some small tweaks, but not many.
* `page`: product entity module that has support for **offline, optimistic updates and realtime sync**.

## API client
An api client is generated in the frontend using [openapi-ts](https://github.com/hey-api/openapi-ts). It includes zod schemas, types and an sdk.

## Sync & Offline
Cella has a hybrid approach to sync and offline. 

### Context vs. product entities
Context entities are just old-school CRUD openapi endpoints. They do not have a sync layer and users only have `read` access while offline: if they enabled `offlineAccess`, data will be prefetched based on the users' menu items (which are in essence context entities). The handling and source of truth is by react-query. 

Product entities are the types of data that users interact with on a daily basis. They are upgraded using a sync + offline layer with create, update and delete mutations queued (so full offline CRUD) while offline.

