# LTI

This document covers [LTI 1.3](https://www.1edtech.org/standards/lti): how your app opens other apps inside its pages, and how a learning platform opens your app inside a course.

### TL;DR

LTI lets one app, the platform, open another, the LTI tool, in a frame on its page, signed in as the same person in the same course. The template plays both roles, each off until a mode turns it on. Two admins connect their apps by pasting one address, and from then on a launch is a click on a tab. What a course becomes in your app, and what its roles mean, you decide in two app-owned files.

## Two roles

Your app is a **platform** when it hosts other apps: an admin installs an LTI tool, approves it and places it as a tab of a channel. Turn it on with `has.ltiPlatform`, which lets the app frame any HTTPS origin.

Your app is an **LTI tool** when a learning platform, such as Canvas or another app on the template, opens it inside a course. Turn it on with the `lti` sign-in method, and list the origins of the platforms that may frame it in `ltiFrameAncestors`.

An app can be both. Either role needs the [OAuth worker](./OAUTH.md) on: it signs launches and serves the platform's addresses. As an LTI tool, the app fetches the platform's configuration and keys server to server. As a platform, it stores the addresses the LTI tool registers and fetches only its key set, to check the LTI tool's token requests. Outside development, each needs a public HTTPS address.

## Registration

One pasted address connects two apps, by LTI Dynamic Registration, whichever side your app is on. Connections and installations belong to the organization's tenant, and only someone who may update the organization manages them. Adding or approving one asks for a recent second factor.

As an LTI tool, an admin creates a registration link under LTI connections in organization settings. It works once and for a short while. The platform's admin pastes it where the platform adds an LTI tool by URL. The app reads the platform's configuration, registers itself there and lists the platform as a connection.

As a platform, an admin pastes the address an LTI tool's admin handed over under LTI tools in organization settings. The LTI tool's registration page opens in a dialog, which closes when the LTI tool says it is done. The new LTI tool then waits for approval.

## Approval

An LTI tool asks for the personal fields it wants: name, email, picture. When approving, the admin chooses which of them a launch carries, and none is chosen by default. Whatever the admin releases, a launch always carries the person's id (the same for every LTI tool), their role, their language, the channel's name and short name, and the organization's tenant id.

An LTI tool may also ask for access scopes of the app's API, such as `user:read`. The admin grants which of them the LTI tool's own tokens carry, none by default, and may change the grant later, which asks the second factor too.

Rejecting a waiting LTI tool deletes its registration. Disabling an approved one stops its launches and its tokens at once, and enabling it again asks for the second factor. An installed LTI tool is a service account without API keys: it shows in the LTI tools card, never among the API keys.

## A launch

A person opens an LTI tool's tab on the platform. From that click to the page inside the frame:

1. The platform checks that the person may read the channel now, and records a launch that works once.
2. The frame posts a login to the LTI tool, which keeps its state in the platform's storage through the frame.
3. The platform signs a statement of who the person is, the course, their roles and the released fields.
4. The LTI tool checks the signature and its state, finds or creates the person, and sets their role in the course.
5. The LTI tool starts an embedded session and shows the course's embedded page in the frame.

The platform's storage replaces a cookie for the launch state. Every launch checks the person's standing anew: someone who left the course is refused at their next click.

## API access

An installed LTI tool reads the app's API as itself, within the scopes the admin granted. It asks the OAuth worker for a token with an assertion signed by a key of the set it registered. The token is for the tenant's API and acts as the installation.

Placing an LTI tool in a channel gives its installation the channel's least privileged role there; removing its last tab takes the role away. With `user:read`, its token lists the people of a channel it is placed in, as far as that role sees them: each person's id, their LTI roles there and only the personal fields the admin released.

Every launch names the API in a claim under the issuer's address: the tenant's API, the tenant, the organization, the channel and the address of its member list. The claim's members are documented in [lti-platform-schema.ts](../../backend/src/modules/lti-platform/lti-platform-schema.ts).

## Courses and roles

A course on the platform is an LTI context. As an LTI tool, your app maps each context to one of its channels in [lti-context-channel.ts](../../backend/src/modules/auth/flows/lti/lti-context-channel.ts). The template maps every context to the organization, with its least privileged role.

An app whose course is a channel below the organization names that channel type there. It creates the channel on an instructor's first launch, named after the course, and maps LTI roles to the channel's roles at every launch. A role in such a channel follows the platform up and down; an organization role only goes up.

A person who arrives for the first time gets an account without a proven email address. An email the platform releases never links them to an existing account.

As a platform, your app says in [launch-context.ts](../../backend/src/modules/lti-platform/launch-context.ts) which channels are LTI contexts and which LTI roles a person's permissions there send. The template sends every channel as a group. Whoever may update the context's channel goes as Instructor, whoever may only read it as Learner, as the permission engine decides with the person's access at launch.

## Embedded pages

A launch ends on a page under `/embed`: the app without its navigation, account menu or links out of the frame. These are the only pages another site may frame, and only the origins your mode lists may do so.

The embedded session lives in a cookie of its own, kept per platform site by the browser. It accepts a change only from the app's own pages, never from another frame on the platform's page. The embedded app keeps its own user, local data and realtime connection, apart from a tab of the app opened beside it.

The template ships the organization's embedded page. An app that maps a course to a channel of its own adds an embedded route for that channel and names it in its pinned [routes-config.tsx](../../frontend/src/routes-config.tsx).

## When it fails

- **A platform without platform storage:** the launch stops and asks the person to contact the platform's administrator.
- **A browser that cannot keep the embedded session:** the page says so and names the browsers that can, such as Chrome, Edge and Firefox.
- **A course not set up yet:** a student who arrives before any instructor is asked to have an instructor open it first.
- **A disabled LTI tool:** its tab on the platform says it cannot be opened until an admin enables it again, and its tokens stop at their next request.
- **A scope taken away:** a token that carries it is refused at its next request. A new token carries what the admin still grants.
- **A deployment the connection does not hold:** the launch is refused, and an organization admin registers the app for that deployment.
- **A deleted connection:** the LTI tool refuses the platform's launches as from a platform it is not connected to, and the sessions its launches started end.

## Not built

- The roster, grade and deep linking services. An LTI tool reads course members through the platform's own API.
- Tokens that act for a person: an installed LTI tool acts only as itself.
- Launch state in a cookie: the platform's storage is the only place for it.
- Registrations that every tenant may install: each registration belongs to one tenant.
- Binding an embedded page to the frame that launched it: a page on the platform's own origin can frame an embedded page under the person's session.
- Canvas as a platform, which the app refuses: its configuration address is not under its issuer, and its sign-in host is not the host that frames the page.

## Try it locally

Development turns both roles on, and `pnpm seed` connects two seeded organizations. The first organization the seeded admin manages is the platform: it shows a tab named after the second, which is registered there as an LTI tool, approved with the name released. Open that tab to land in the second organization inside the frame, as a new person carrying your name.

To walk the registration by hand, create a registration link under LTI connections in one organization, paste it under LTI tools in another, approve the LTI tool and add its tab.
