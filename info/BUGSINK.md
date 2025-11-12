# Error Tracking with Bugsink

You can use **Bugsink** for flexible error tracking — either **locally** during development or want a local error tracking solution or
**remotely**.

Bugsink integrates seamlessly with the standard **Sentry** workflow, so all your error tracking configuration is based on the usual
Sentry workflow.

- **Local mode:** Keep errors private and track them on your own machine or local environment.
- **Remote mode:** Send errors to a shared or hosted Bugsink instance for team-wide visibility and centralized monitoring.

## ⚙️ Setup for Bugsink

### 1. **Bugsink Setup**

- **Local mode:**

  1. **Start Bugsink locally**

  ```bash
  pnpm docker:up:bugsink
  ```

  By default, the container starts with the following environment variables:

  - `CREATE_SUPERUSER: admin:admin`
  - `PORT: 8000`

  Once running, you can access the local Bugsink instance in your browser at **http://localhost:8000**.

  2. **Follow the Bugsink Quickstart**

  Complete your local setup by following the official documentation:

  👉 [Bugsink Quickstart Guide](https://www.bugsink.com/docs/quickstart/)

- **Remote mode:**

  1. **Register a Bugsink Account**

  - Go to [Bugsink.com](https://www.bugsink.com/).
  - Create an account and set up a new project for your application.

  2. **Obtain Your DSN**

  - After creating the project, copy the generated **DSN** (Data Source Name).
  - Use this DSN in your application’s configuration to connect it to your Bugsink project.

### 2. **Configure your application:**:

Add your new Bugsink project DSN to the application config:

```ts
appConfig.errorTrackerDsn = "<YOUR_BUGSINK_PROJECT_DSN>";
```

### 3. **Run your application:**

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
