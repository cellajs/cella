# Roadmap
We maintain a very rough roadmap here. Its a work in progress and things will get added, removed and changed. We will eventually manage a roadmap elsewhere.
Last update: May 26,2024

## 📅 &nbsp; Current projects
* Electric SQL for local-first content
* [imado.eu](imado.eu) for file handling
* A customizable, extendable permission system
* Having SSR for a blog

## 🧩 &nbsp; Modularity
* A scaffolding solution is necessary to keep the template useful while the project is growing. Perhaps we can collaborate with a dev which is already maintaining a scaffolding tool?
* Notifications module (with Novu?)

## 🧪 &nbsp; Testing
* Vitest + Playwright + Storybook [https://github.com/shadcn-ui/ui/pull/1561](https://github.com/shadcn-ui/ui/pull/1561)
* Automated security audit / testing solution
* Perf testing with K6 / Grafana

## ☁️ &nbsp; Hosting options
We support only render.com out of the box at the moment. More should follow:
* Cloudflare (starting with Pages + Hyperdrive, later perhaps Queues, KV and R2) + Neon/Supabase

## 📱 &nbsp; Native mobile/desktop app
* [Expo](https://expo.dev/) or [CapacitorJS](https://github.com/ionic-team/capacitor) (OS) for native apps
* [Electron-Vite](https://github.com/electron-vite/electron-vite-react) or [Tauri](https://github.com/tauri-apps/tauri) or [ToDesktop](https://www.todesktop.com/) for desktop app
