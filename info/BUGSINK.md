# Error Tracking with Bugsink

If you do **not want to expose errors directly** during development or want a local error tracking solution, you can use **Bugsink**. This setup works in conjunction with **Sentry**, so all your error tracking configuration is based on the usual Sentry workflow.

---

### Local Setup for Bugsink

1. **Start Bugsink locally**:

By default, the Bugsink container is configured with:

- `CREATE_SUPERUSER: admin:admin`
- `PORT: 8000`

```bash
pnpm docker:up:bugsink
```

This will start the Bugsink container along with its required PostgreSQL database.

2. **Follow Bugsink Quickstart:**:

Visit the official documentation and set up your project:

[Bugsink Quickstart Guide](https://www.bugsink.com/docs/quickstart/)

3. **Configure your application:**:

Add your new Bugsink project DSN to the application config:

```ts
appConfig.errorTrackerDsn = "<YOUR_BUGSINK_PROJECT_DSN>";
```

4. **Run your application:**

- Run with [pglite](https://pglite.dev/)

```bash
pnpm install
pnpm quick
```

- Run it with full postgres and [electric-sync](https://electric-sql.com/) in docker

```bash
pnpm install
pnpm docker
pnpm seed
pnpm dev
```
