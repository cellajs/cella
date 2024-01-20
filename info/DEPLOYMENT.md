# Deployment

Cella will make it easy to deploy on [Render](https://www.render.com) (server & db, optionally frontend) and [Netlify](https://www.netlify.com) (frontend only). Probably more options will become available over time.

## Deploy backend and frontend to render.com

Go to [blueprints](https://dashboard.render.com/select-repo?type=blueprint) and select the repo by clicking `Connect`.

Speed up the process by using the existing `render.yaml` file in the root. For your production environment you will need to overwite the `VITE_BACKEND_URL` for the frontend and `VITE_FRONTEND_URL` in the backend (for CORS). All deployed PRs will use the onrender.com domain.

## Deploy Cloudflare Proxy

To run Cella on one domain in production we proxy traffic without touching Cella itself. This way certificates are handled automatically, and you end up with your application on root `{domain}/` and the API running on the same domain using `{domain}/api/v1/`.

Add your site in Cloudflare, you will need to be able to manage its DNS records. 

Update `BACKEND_RENDER_URL` and `FRONTEND_RENDER_URL` in `proxy/wrangler.toml` to what the results are from the previous step, and configure your custom domain accordingly.

Now run `pnpm run proxy:deploy` and follow the steps from there.

## Alternative: Deploy frontend on [Netlify](https://app.netlify.com)

Deploying the frontend on Netlify can be done by adapting the `netlify.toml` file in the /frontend folder.

## Manage translations

When your app is growing and has multiple languages, you can optionally upload and manage your messages to translate at <https://simplelocalize.io>.

Fill `simpleLocalizeProjectToken` in /config/default.ts and `SIMPLELOCALIZE_API_KEY` to your  .env file.

```bash
pnpm run i18n:upload
```

After upload messages to translate, you need to publish them (in 'Hosting' tab on SimpleLocalize)

## Logging and error tracking

We use [AppSignal](https://appsignal.com) for logging and error tracking. To use it on backend, you need to create an account and set `APPSIGNAL_BACKEND_KEY` env variable in your .env file (and Render env variables). For frontend error logging, created another key and add it to /config/default.ts under `appsignalFrontendKey`.

For testing backend on development, you need to change `active` in /backend/src/lib/appsignal.ts\
For testing frontend on development, you need to change `key` in /frontend/src/lib/appsignal.ts
