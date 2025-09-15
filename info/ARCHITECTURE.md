# Architecture
This document describes the high-level architecture of Cella.

### Target product
Cella in general is targeted towards being a template for SaaS development. But that is a large segment. So when to use / not use cella? Here are some thoughts on that. Use cella if the below matches your product/development requirements:

* frequent-use or heavy use web applications
* focused on user generated content that requires some form of authentication/authorization. So either semi-public or private access.
* Requires a great UX on different device, but native apps are not a direct priority
* Development budget and time is limited
* Fullstack development is seen as beneficial to work effectively and to provide engineering stability. 

### Core aspects
 * Type safe, without overdoing it. 
 * Only build what you are going to use yourself.
 * Stay humble and remain a template, not a framework. So prevent abstraction layers and leverage libraries to the fullest extent.
 * A narrow stack: Cella uses Drizzle ORM and will not make it replaceable with another ORM.
 * Modularity. As Cella will grow, we need to make sure you can scaffold only the modules that you need.
 * Open standards. Our long term vision is that each Cella - as in each cell - can speak fluently with other cells.
 * Focused on client-side rendering (CSR) and - once it becomes relevant - static site generation (SSG). This seems to align best with our hybrid idiom to support offline and sync capabilities and reduce 'server dependency'. 

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
- [electric sync](https://electric-sql.com/)

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
│   │   ├── permissions       Setup of your authorization layer
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
│   │   ├── query             Tanstack query client
│   │   ├── routes            Code-based routes
│   │   ├── store             Zustand data stores
│   │   ├── styling           Tailwind styling
│   │   ├── utils             Reusable functions
├── info                      Information about cella
└── locales                   Translations
```

## Data modeling
Some of the db tables (check out [/backend/src/db/schema]() ) in cella are an `entity`. Entities can be split in four categories:
* All entities (`user`, `organization`, `attachments`)
* `PageEntityType`: 'Pages' that can be searched for (`user`, `organization`)
* `ContextEntityType`: Has memberships (`organization`)
* `ProductEntityType`: Content related, no membership (`attachment`)

The example cella setup has one product entity - `attachments` - and one context: `organizations`. But in a typical app you would have a context entity such as a 'bookclub' and more product entities such as 'books' and 'reviews'.

## API Design
An OpenAPI is built with [zod-openapi](https://github.com/honojs/middleware/tree/main/packages/zod-openapi). Please read the readme in this middleware before you get started. An API reference is created using [scalar](https://github.com/scalar/scalar).

## Modularity
Both frontend and backend have business logic split in modules. Most of them are in both backend and frontend, such as `authentication`, `users` and `organizations`. The benefit of modularity is twofold: better code (readability, portability etc) and to pull upstream cella changes with less friction.

Zooming in on some of the frontend modules:
* `common`: a large set of reusable react components and services 
* `ui`: Full with shadcn UI components. They have some small tweaks, but not many.
* `attachments`: product entity module that has support for **offline, optimistic updates and realtime sync**.

## API client
An api client is generated in the frontend using [openapi-ts](https://github.com/hey-api/openapi-ts). It includes zod schemas, types and an sdk.

## Security
Link to valuable resources:
* https://cheatsheetseries.owasp.org/
* https://mvsp.dev/mvsp.en/
 