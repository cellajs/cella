# Roadmap
We maintain a very rough roadmap here. Its a work in progress and things will get added, removed and changed. We will eventually manage a roadmap elsewhere.

## Current projects
* [imado.eu](imado.eu) for file handling
* A customizable, extendable permission system
* Having SSG sites for blog and API docs, which use some of the same UI components as the web app

## Modularity
* A scaffolding solution is necessary to keep the template useful while the project is growing. Perhaps we can collaborate with a dev which is already maintaining a scaffolding tool?
* Notifications module

## Testing
* Vitest + Playwright + Storybook
* Automated security audit / testing solution
* Perf testing with K6 / Grafana

## Local-first
For app-specific data and endpoints that require a reactive, realtime UX with offline accessibility, we consider [Electric-SQL](https://electric-sql.com/). We are planning to look into their [pglite](https://github.com/electric-sql/pglite) project too.

## Hosting options
We support only render.com out of the box at the moment. More should follow:
* Cloudflare (starting with Pages + Hyperdrive, later perhaps Queues, KV and R2) + Neon/Supabase

## Optional third party tooling
Some optional third party tooling has already been integrated. More things to consider:
* [Novu.co](https://novu.co) API for notifications suite
* [Tinybird.co](https://tinybird.co) for building real-time data analytics more quickly
* [Algora](https://algora.io) Bounties for (OS) development work
* [Scaleway TEM](https://www.scaleway.com/en/transactional-email-tem/) (France) for transactional email
* [Storybook](https://storybook.js.org/) for UI: [https://github.com/shadcn-ui/ui/pull/1561](https://github.com/shadcn-ui/ui/pull/1561)
* [Mave.io](https://www.mave.io/) (Dutch) for videos

## Native mobile/desktop app
* [Expo](https://expo.dev/) or [CapacitorJS](https://github.com/ionic-team/capacitor) (OS) for native apps
* [Electron-Vite](https://github.com/electron-vite/electron-vite-react) or [Tauri](https://github.com/tauri-apps/tauri) or [ToDesktop](https://www.todesktop.com/) for desktop app
