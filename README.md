<div style="text-align: center">

  <img alt="screenshot" src="./frontend/public/static/marketing/screenshots/readme-screenshot-dark.png#gh-dark-mode-only" />
  <img alt="screenshot" src="./frontend/public/static/marketing/srcreenshots/readme-screenshot.png#gh-light-mode-only" />

<br />

<!--
 *                            _ _
 *    ░▒▓█████▓▒░     ___ ___| | | __ _
 *    ░▒▓█   █▓▒░    / __/ _ \ | |/ _` |
 *    ░▒▓█   █▓▒░   | (_|  __/ | | (_| |
 *    ░▒▓█████▓▒░    \___\___|_|_|\__,_|                            
 *
 -->


<h1><b>Cella</b></h1>
<p>
    <b>Template to build web apps with sync engine for offline and realtime use. Postgres, openapi & react-query are foundational layers.</b>
    <br />
    <br />
    <a href="https://cellajs.com">Website</a>
    ·
    Prerelease
    ·
    MIT license
</p>
<br />
</div>

#### Contents

- [Agent guidelines](/cella/AGENTS.md)
- [Architecture](/cella/ARCHITECTURE.md)
- [Quickstart](/cella/QUICKSTART.md)

## Requirements

- Nodejs 24.x. Check `node -v`. (Recommend: [Volta](https://docs.volta.sh/guide/)).
- PostgreSQL 17+. The sync engine depends on logical replication row filters with `REPLICA IDENTITY FULL` (draft boundary) — the bundled docker compose already runs PG 17.
- Make sure you can work with [Docker](https://docs.docker.com/get-docker/). (Recommend: [OrbStack](https://orbstack.dev/)).
- Ideally you work with [git over ssh](https://docs.github.com/en/authentication/connecting-to-github-with-ssh) and have the [gh cli](https://cli.github.com/) installed.

<br>

## Create app

Do **not fork** this repo directly. Use the create CLI to get started:

```bash
pnpm create @cellajs/cella
```

Read the [Quickstart](/cella/QUICKSTART.md) so you can build something unique quickly.
