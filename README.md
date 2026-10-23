<center>

  <img alt="screenshot" src="./frontend/public/static/marketing/screenshots/readme-screenshot-dark.webp#gh-dark-mode-only" />
  <img alt="screenshot" src="./frontend/public/static/marketing/screenshots/readme-screenshot.webp#gh-light-mode-only" />

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
</center>

#### Contents

- [Quickstart](./cella/QUICKSTART.md)
- [Architecture](./cella/ARCHITECTURE.md)
- [Agent guidelines](./cella/AGENTS.md)


## Requirements

Node.js 26, [pnpm 11](https://pnpm.io/installation), [Docker](https://docs.docker.com/get-docker/). For syncing with upstream: [git over ssh](https://docs.github.com/en/authentication/connecting-to-github-with-ssh) and [gh cli](https://cli.github.com/)

<br>

## Create app

For best DX, **do not** just clone or copy this repo. Use the create CLI:

```bash
pnpm create @cellajs/cella
```

Then read the [Quickstart](./cella/QUICKSTART.md).
