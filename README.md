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
    <b>Single stack TypeScript template to build powerful web apps with sync & offline capabilities.</b>
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
> Please be aware this is a prerelease. It does NOT meet production requirements yet and large breaking changes still occur regularly. An alpha version will be released once we have solid tests for at least authentication & authorization. Want to contribute or discuss cella for one of your projects? Let's connect! ✉️ <info@cellajs.com>

#### Contents
- [Installation](#installation)
- [Architecture](/info/ARCHITECTURE.md)
- [Roadmap](/info/ROADMAP.md)
- [Deployment](/info/DEPLOYMENT.md)

## Requirements
- Make sure you have node installed with `node -v`. Install Node 20.x or 22.x. (ie. [Volta](https://docs.volta.sh/guide/)).
- Ideally you work with [git over ssh](https://docs.github.com/en/authentication/connecting-to-github-with-ssh).

<br>

## Create your own app
Want to use cella to build your new web app? We made it simple using a short create CLI. Simply follow the steps to get started:

```bash
pnpm create @cellajs/cella@latest
```

You now have an implementation-ready web app. 🤯! But ... without any unique functionality 🤓. Read the [Quickstart](/info/QUICKSTART.md) so you can build something unique quickly.

<p>&nbsp;</p>

## Installation
For those that (also) want to participate in development:

```bash
git clone git@github.com:cellajs/cella.git && cd cella
```

### A. Quick setup

```bash
pnpm install && pnpm quick
```

### B. Full setup
For a full setup with sync capabilities, you need Docker. It will allow you to run Postgres instead of pglite and it will also run electric-sync. Install [Orbstack](https://orbstack.dev/) or [Docker](https://docs.docker.com/get-docker/).

```bash
pnpm install
pnpm docker
```

Start all servers:

```bash
pnpm dev
```

Lastly, [seed](/backend/scripts/README.md) your db (with `dev` running) to sign in as [admin user](/backend/scripts/README.md).

```bash
pnpm seed
```

Check it out at [localhost:3000](http://localhost:3000)! Generated API docs can be found at [localhost:4000/docs](http://localhost:4000/docs). Manage your local db with [local.drizzle.studio](http:local.drizzle.studio).


<br />
<br />

💙💛 Big thank you to [drizzle](https://github.com/drizzle-team/drizzle-orm), [hono](https://github.com/honojs/hono), [tanstack-router](https://github.com/tanstack/router) & [electric](https://github.com/electric-sql/electric).
