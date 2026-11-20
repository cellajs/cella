---
breaking: true
clientCacheBump: true
caughtBy: nothing
grep: ltiAsksEmail, deploymentIds, registrationClientUri, recordFirstLtiDeployment, lti_deployment_unknown, lti_deployment
---

# LTI tool: email by opt-in, every deployment

As an LTI tool, the app asks a platform for each person's name, and for their email only when its
`shared/config/config.default.ts` sets `ltiAsksEmail: true`. Without it, an email a platform sends anyway is not kept,
and one stored before on an `lti` identity is cleared at the person's next launch or import. A connection takes every
deployment of its platform: `config.deploymentIds` is a list, `recordFirstLtiDeployment` is `addLtiDeployment`, and
`config.registrationClientUri` is no longer stored or served.

## What & why

LTI Dynamic Registration asks an LTI tool to be explicit about identity claims, and Canvas derives its privacy level
from them: name with email is `public`, which also sends the picture and an observer's students. The app now asks for
email only by opt-in. LTI Core 1.3 section 3.1.3 makes an LTI tool accept several deployments under one client id.

## Blast radius

Every LTI tool app, with no compile error: new registrations ask for names alone, and stored LTI addresses are cleared
unless the app opts in. A platform app on the template sees name-only requests from such LTI tools. `clientCacheVersion`
rises. No migration.

## Run

No script: manual.

## Manual steps

1. Not caught by the compiler. If the app needs people's email addresses from LTI launches or imports, set `ltiAsksEmail: true` in its `shared/config/config.default.ts` before it deploys the upgrade: every launch and import after the deploy clears an address the app does not ask for.
2. Not caught by the compiler. If the app wants email from a platform it registered at before, register the app there again after setting `ltiAsksEmail`: a platform keeps the claims a registration asked for.
3. Not caught by the compiler. As a platform, an LTI tool on the template that registers after the upgrade asks for the name alone, the app's own LTI tool side included: an approval or a seed that releases `email` to it is refused as a field it did not ask for.
4. Partly caught by the compiler: a call of `recordFirstLtiDeployment` and a read of `config.registrationClientUri` fail to compile, a read of `config.deploymentIds[0]` does not. Search the app for `deploymentIds[0]`: where it reads an LTI connection's one deployment, read the list. Call `addLtiDeployment` where it called `recordFirstLtiDeployment`, and drop reads of `config.registrationClientUri`.
5. Not caught by the compiler. Where the app's `app.json` overrides `lti_deployment`, move it to `lti_deployments`, which reads "Deployments". Where its `appError.json` overrides `lti_deployment_unknown`, check it: the error now means a launch with no deployment, or a new one past the connection's cap.
6. Not caught by the compiler. Where the app sets its own `clientCacheVersion`, raise it.

## Verify

```sh
pnpm check
```

By hand: register the LTI tool at a platform and read the fields its approval asks for, then launch with an email claim and check whether the `lti` identity keeps it.
