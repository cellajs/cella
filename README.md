<div align="center">

  <img src="./.github/banner-dark.png#gh-dark-mode-only" />
  <img src="./.github/banner.png#gh-light-mode-only" />

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
    prerelease version
    ·
    MIT license
  </p>
  <br />
  <br />
</p>

</div>

#### Prerelease

> [!CAUTION]
> Please be aware this is a prerelease. It does not meet production requirements yet and large breaking changes still occur regularly. Want to contribute? Let's connect! ✉️ <info@cellajs.com>


#### Contents
- [Installation](#installation)
- [Architecture](/info/ARCHITECTURE.md)
- [Roadmap](/info/ROADMAP.md)
- [Deployment](/info/DEPLOYMENT.md)

## Installation

#### Prerequisites
- **Node:** Check node with `node -v`. Install Node 20.x or 22.x. (ie. [Volta](https://docs.volta.sh/guide/)).
- **Docker:** Install [Orbstack](https://orbstack.dev/) or [Docker](https://docs.docker.com/get-docker/)

<br>

First step is to clone

```bash
git clone git@github.com:cellajs/cella.git && cd cella
```

Use the `.env.example` files to create `.env` files in folder `/backend`, `/email` and `/tus`. Then install:

```bash
pnpm install
```

Page-related resources are handled by a conventional API. Content-related resources use a *local-first* strategy with [ElectricSQL](https://github.com/electric-sql/electric).
Therefore, `generate` and `migrate` commands will execute for normal schemas and for *electric schemas*.

```bash
pnpm backend generate
pnpm backend migrate 
```

Check it out at [localhost:3000](http://localhost:3000) after

```bash
pnpm dev
```

Lastly, [seed](/backend/seed/README.md) your db (with `dev` running) to sign in as [admin user](/backend/seed/README.md).

```bash
pnpm backend seed
```

That's it! Generated API docs can be found at [localhost:4000/docs](http://localhost:4000/docs). Manage your local db with [local.drizzle.studio](http:local.drizzle.studio).


### More info
- Please [install](https://marketplace.visualstudio.com/items?itemName=biomejs.biome) [Biome](https://biomejs.dev/) for code style. Fix with `pnpm run check:fix` and type check with `pnpm run check:types`
- EADDRINUSE errors? Try `sudo lsof -i :1080 -i :3000 -i :4000` and then `kill -9 *PID*` with a space-separated list of `PID`
- pnpm cache issues? Try `pnpm store prune`
- turbo cache issues? Try adding `--force` to the command
- docker cache issues? Try `docker builder prune --force`

<br />
<br />

💙💛 Big thank you too [drizzle-orm](https://github.com/drizzle-team/drizzle-orm), [hono](https://github.com/honojs/hono), [tanstack-router](https://github.com/tanstack/router), [electric-sql](https://github.com/electric-sql/electric) & [shadcn](https://github.com/shadcn-ui/ui).
