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
    <b>Narrow stack TypeScript template to build collaborative web apps with sync & offline capabilities.</b>
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
> This is a prerelease. Versioned releases will start once we have solid tests for authentication, authorization and data access. Want to contribute or discuss cella with us? Let's connect! ✉️ <info@cellajs.com>

#### Contents
- [Create app](#create-app)
- [Architecture](/info/ARCHITECTURE.md)
- [Roadmap](/info/ROADMAP.md)
- [Deployment](/info/DEPLOYMENT.md)

## Requirements
- Make sure you have node installed with `node -v`. Install Node 24.x. (ie. [Volta](https://docs.volta.sh/guide/)).
- Ideally you work with [git over ssh](https://docs.github.com/en/authentication/connecting-to-github-with-ssh).

<br>

## Create app
Do **not fork** this repo directly. Use the create CLI to get started:

```bash
pnpm create @cellajs/cella@latest
```

You now have an implementation-ready web app 🤯. But ... without any unique functionality 🤓. Read the [Quickstart](/info/QUICKSTART.md) so you can build something unique quickly.

<p>&nbsp;</p>

## Contribute
For those that (also) want to participate in development:

```bash
git clone git@github.com:cellajs/cella.git && cd cella
```

### A. Quick setup
Run your db using a local pglite. Its fast to build and to clean up. Simply remove `backend/.db`. However, you need to use the full setup to run electric-sync.

```bash
pnpm install && pnpm quick
```

### B. Full setup
For a full setup with sync capabilities, you need to run postgres + electric-sync. Install [Orbstack](https://orbstack.dev/) or [Docker](https://docs.docker.com/get-docker/).

```bash
pnpm install
pnpm docker
pnpm seed
```

Start all servers:

```bash
pnpm dev
```

Check it out at [localhost:3000](http://localhost:3000)! Generated API docs can be found at [localhost:4000/docs](http://localhost:4000/docs). Manage your local db with [local.drizzle.studio](http:local.drizzle.studio).


<br />
<br />

💙💛 Big thank you to [drizzle](https://github.com/drizzle-team/drizzle-orm), [hono](https://github.com/honojs/hono), [tanstack-router](https://github.com/tanstack/router) & [electric](https://github.com/electric-sql/electric).
