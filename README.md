<div align="center">

  <img src="./info/screenshot-dark.png#gh-dark-mode-only" />
  <img src="./info/screenshot.png#gh-light-mode-only" />

<br />

<!--
 *                            _ _
 *    ░▒▓█████▓▒░     ___ ___| | | __ _
 *    ░▒▓█   █▓▒░    / __/ _ \ | |/ _` |
 *    ░▒▓█   █▓▒░   | (_|  __/ | | (_| |
 *    ░▒▓█████▓▒░    \___\___|_|_|\__,_|                            
 *
 -->


<p>
	<h1><b>Cella</b></h1>
<p>
    <b>Single stack TypeScript template to build local-first SaaS.</b>
    <br />
    <br />
    <a href="https://cellajs.com">Website</a>
    ·
    Prerelease
    ·
    MIT license
  </p>
  <br />
</p>

</div>

> [!CAUTION]
> Please be aware this is a prerelease. It does not meet production requirements yet and large breaking changes still occur regularly. Want to contribute? Let's connect! ✉️ <info@cellajs.com>


#### Contents
- [Installation](#installation)
- [Architecture](/info/ARCHITECTURE.md)
- [Roadmap](/info/ROADMAP.md)
- [Deployment](/info/DEPLOYMENT.md)

<br>

## Installation

#### Prerequisites
- **Node:** Check node with `node -v`. Install Node 20.x or 22.x. (ie. [Volta](https://docs.volta.sh/guide/)).
- **Docker:** Install [Orbstack](https://orbstack.dev/) or [Docker](https://docs.docker.com/get-docker/)

<br>

First step is to clone

```bash
git clone git@github.com:cellajs/cella.git && cd cella
```

Use `.env.example` to create `.env` files in `/backend` and (optionally) `/tus`. Install and run docker.

```bash
pnpm install
pnpm docker
```

Start all servers:

```bash
pnpm dev
```

Page-related resources are handled by fetching from an [API](https://api.cellajs.com/docs). Content-related resources use a *local-first* strategy with [ElectricSQL](https://github.com/electric-sql/electric). Generate backend migrations for both and client-side schemas for *electrified schemas*.

```bash
pnpm generate
```

Lastly, [seed](/backend/seed/README.md) your db (with `dev` running) to sign in as [admin user](/backend/seed/README.md).

```bash
pnpm seed
```

Check it out at [localhost:3000](http://localhost:3000)! Generated API docs can be found at [localhost:4000/docs](http://localhost:4000/docs). Manage your local db with [local.drizzle.studio](http:local.drizzle.studio).


### More info
- Please [install](https://marketplace.visualstudio.com/items?itemName=biomejs.biome) [Biome](https://biomejs.dev/) for code style. Fix with `pnpm run check:fix` and type check with `pnpm run check:types`
- EADDRINUSE errors? Try `sudo lsof -i :1080 -i :3000 -i :4000` and then `kill -9 *PID*` with a space-separated list of `PID`
- pnpm cache issues? Try `pnpm store prune`
- turbo cache issues? Try adding `--force` to the command
- docker cache issues? Try `docker builder prune --force`

<br />
<br />

💙💛 Big thank you too [drizzle-orm](https://github.com/drizzle-team/drizzle-orm), [hono](https://github.com/honojs/hono), [tanstack-router](https://github.com/tanstack/router), [electric-sql](https://github.com/electric-sql/electric) & [shadcn](https://github.com/shadcn-ui/ui).
