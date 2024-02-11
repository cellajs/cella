# Deployment

Cella makes it easy to deploy on [Render](https://www.render.com) (server & db, frontend) and with Cloudflare for a proxy. Probably more options will become available over time.

## Deploy backend and frontend to render.com

Go to [blueprints](https://dashboard.render.com/select-repo?type=blueprint) and select the repo by clicking `Connect`.

Speed up the process by using the existing `render.yaml` file in the root. All deployed PRs will use the onrender.com domain.

## Deploy Cloudflare Proxy

To run Cella on one domain in production we proxy traffic without touching Cella itself. This way certificates are handled automatically, and you end up with your application on root `{domain}/` and the API running on the same domain using `{domain}/api/v1/`.

Add your site in Cloudflare, you will need to be able to manage its DNS records. 

Update `BACKEND_RENDER_URL` and `FRONTEND_RENDER_URL` in `proxy/wrangler.toml` to what the results are from the previous step, and configure your custom domain accordingly.

Now run `pnpm run proxy:deploy` and follow the steps from there.

## Logging and error tracking

We use [AppSignal](https://appsignal.com) for logging and error tracking. You need to create an account and set `APPSIGNAL_BACKEND_KEY` env variable in your .env file (and Render env variables) for backend tracking. For frontend error logging, created another key and add it to /config/default.ts under `appsignalFrontendKey`.

For testing backend on development, you need to change `active` in /backend/src/lib/appsignal.ts\
For testing frontend on development, you need to change `key` in /frontend/src/lib/appsignal.ts
