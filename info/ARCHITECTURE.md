# Architecture
This document describes the high-level architecture of Cella. 

### Target product
Cella in general is targeted towards being a template for SaaS development. But that is a large segment. So when to use / not use cella? Here are some thoughts on that. Use cella if the below matches your product/development requirements:

* frequent-use or heavy use web applications
* focused on user generated content that requires some form of authentication/authorization. So either semi-public or private access.
* Requires a great UX on different device, but native apps are not a direct priority
* Development budget and time is limited
* Fullstack development is seens as beneficial to work effectively and to provide engineering stability. 

### Core aspects
 * Type safe, without overdoing it. 
 * Only build what you are going to use yourself.
 * Stay humble and remain a template, not a framework. So prevent abstraction layers and leverage libraries to the fullest extent.
 * A single/narrow stack: ie. Cella uses Drizzle ORM and will not make it replaceable with another ORM.
 * Modularity. As CellaJS will grow, we need to make sure you can scaffold only the modules that you need.
 * Open standards. Our long term vision is that each Cella - as in each cell - can speak fluently with other cells.
 * Focused on client-side rendering (CSR) and - once it becomes relevant - static site generation (SSG). This seems to align best with our hybrid idiom to support offline and sync capabilities and reduce 'server dependency'. 

### Backend
- [NodeJS](https://nodejs.org)
- [Hono](https://hono.dev)
- [Postgres](https://www.postgresql.org)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Zod](https://github.com/colinhacks/zod)
- [OpenAPI](https://www.openapis.org)
- [JSX Email](https://jsx.email/)

### Frontend
- [React](https://reactjs.org)
- [Tanstack Router](https://github.com/tanstack/router)
- [Tanstack Query](https://github.com/tanstack/query)
- [Zustand](https://github.com/pmndrs/zustand)
- [Electric Sync](https://electric-sql.com/)

### Frontend / UI
- [React Data Grid](https://github.com/adazzle/react-data-grid)
- [Shadcn UI](https://ui.shadcn.com)
- [I18next](https://www.i18next.com)
- [Lucide icons](https://lucide.dev)

### Build tools
- [pnpm](https://pnpm.io)
- [Vite](https://vitejs.dev)
- [Vite-PWA](https://github.com/antfu/vite-plugin-pwa)
- [Biome](https://biomejs.dev)
- [Lefthook](https://github.com/evilmartians/lefthook)
- [PGLite](https://pglite.dev/)


## File structure
```
.
├── backend
|   ├── .db                   Location of db when using pglite
|   ├── emails                Email templates with jsx-email
│   ├── drizzle               DB migrations
│   ├── seed                  Seed scripts
│   ├── src                   
│   │   ├── db                Connect, table schemas
│   │   ├── lib               3rd part libs & important helpers
│   │   ├── middlewares       Hono middlewares
│   │   ├── modules           Modular distribution of routes, schemas etc
│   │   ├── permissions       Setup of your authorization layer
│   │   └── utils             Generic functions
├── config                    Shared config: default, development, production
├── frontend                  Frontend SPA
│   ├── public                
│   ├── src                   
│   │   ├── hooks             Generic react hooks
│   │   ├── json              Static JSON
│   │   ├── lib               Library code and core helper functions
│   │   ├── modules           Modular distribution of components
│   │   ├── routes            Code-based routes
│   │   ├── store             Zustand data stores
│   │   ├── utils             Generic functions
├── info                      General info
└── locales                   Translations
```

## Data modeling
Some of the data tables (check out [/backend/src/db/schema]() ) in cella are an `entity`. Entities can be split in four types:
* All entities (`user`, `organization`, `attachments`)
* `PageEntityType`: entityType that can be searched for (`user`, `organization`)
* `ContextEntityType`: Has memberships (`organization`)
* `ProductEntityType`: Content related entities without membership (`attachment`)

The default cella setup has one example product entity - `attachments` - and one context: `organizations`. 

## API Design
An OpenAPI is built with [zod-openapi](https://github.com/honojs/middleware/tree/main/packages/zod-openapi). Please read the readme in this middleware before you get started.

## Modularity
Both frontend and backend already have many modules in common, such as `authentication`, `users` and `organizations`. There are more frontend modules however, also for `home`, `marketing`, `navigation`. The benefit of modularity is twofold: better code (readability, portability etc) and to make receiving cella updates possible.

Zooming in on some of the frontend modules:
* `common`: a cella-predefined set of reusable react components and services 
* `ui`: Full with shadcn UI components. They have some small tweaks however and it is to be expected you will customize them yourself further.
* `attachments`: product entity module that has support for **offline, optimistic updates and realtime sync**.



## Security

Link to valuable resources:
* https://mvsp.dev/mvsp.en/
 