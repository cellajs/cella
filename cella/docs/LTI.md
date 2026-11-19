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

The app refuses a platform whose token endpoint or authorization server sits on another host than its issuer, such as Canvas: it signs for its issuer's host alone.

As a platform, an admin pastes the address an LTI tool's admin handed over under LTI tools in organization settings. The LTI tool's registration page opens in a dialog, which closes when the LTI tool says it is done. The new LTI tool then waits for approval.

## Approval

An LTI tool asks for the personal fields it wants: name, email, picture. When approving, the admin chooses which of them a launch carries, and none is chosen by default. Whatever the admin releases, a launch always carries the person's id (the same for every LTI tool), their role, their language, the channel's name and short name, and the organization's tenant id.

The approval dialog also shows where launches go and the site whose keys act as the LTI tool. Registration refuses an LTI tool whose launch addresses or key set lie off the domains it declares.

An LTI tool may also ask for access scopes of the app's API. Only a scope that a route for installed LTI tools reads can be asked for and granted, today `user:read`. The approval dialog lists them under API access, none chosen by default. What the admin grants, the LTI tool does on its own: it asks no person, and it reaches only the courses where it has a tab.

The admin changes the grant later on the LTI tool's tile, which asks the second factor too. Withdrawing a scope asks first, and the LTI tool loses it at its next request.

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

Its reach follows its tabs, read at every request. A tab gives the installation the least privileged role of its course: the channel a launch names as its context, also when the tab sits in a channel below it. Removing the last tab, or the channel, takes that away. Nothing about a tab is stored on the installation.

With `user:read`, its token lists the people of such a course, as far as that role sees them: each person's id, their LTI roles there and the personal claims a launch carries.

The platform's configuration names its issuer as the authorization server, and an LTI tool addresses its assertion there.

A launch of an LTI tool granted a scope names the API in a claim under the issuer's address: the tenant's API, the tenant, the organization and the address of its course's member list. A launch without a course names no member list, and one of an LTI tool granted nothing carries no claim. The claim's members are documented in [lti-platform-schema.ts](../../backend/src/modules/lti-platform/lti-platform-schema.ts).

## Courses and roles

A course on the platform is an LTI context. As an LTI tool, your app maps each context to one of its channels in [lti-context-channel.ts](../../backend/src/modules/auth/flows/lti/lti-context-channel.ts). The template maps every context to the organization, with its least privileged role.

An app whose course is a channel below the organization names that channel type there. It creates the channel on an instructor's first launch, named after the course, and maps LTI roles to the channel's roles at every launch. A role in such a channel follows the platform up and down. An organization role only goes up, and never to one that may update the organization, as the permission engine decides.

A person who arrives for the first time gets an account without a proven email address, and takes a seat of the tenant's member limit. An email the platform releases never links them to an existing account. An account named before the platform released a name takes the name a later launch or import brings, as long as nothing else signs it in.

As a platform, your app says in [launch-context.ts](../../backend/src/modules/lti-platform/launch-context.ts) which channels are LTI contexts and which LTI roles a person's permissions there send. The template sends every channel as a group. Whoever may update the context's channel goes as Instructor, whoever may only read it as Learner, as the permission engine decides with the person's access at launch.

## Course members

As an LTI tool, your app also reads who is in a course from a platform built on the template, before any of them launched. It asks for `user:read` when it registers. A platform that grants nothing, or any other platform, still launches it.

The import starts when an Instructor or Administrator of the course launches and the launch named the platform's API. It runs on the [jobs worker](./JOBS.md), at most once in a short while per course, and the launch never waits for it. No button starts one: the next such launch after that while does.

It reads each person's id, their LTI roles in the course, and their name and email address where the platform's admin released them.

Each person listed gets the account their own launch finds later, and the role a launch would give them, by the same rules. The import adds and updates, and never removes anyone: who left the course stays a member until an admin removes them.

The platform decides who is in a course. A person an admin removes in your app is added again by the next launch or import while the platform lists them: remove them on the platform.

The import writes as a service account of the connection, which no admin manages and which stays, disabled, when the connection is deleted. A person who needs a seat when the member limit leaves none is left out, and the import goes on with the rest.

Under LTI connections, each connection lists its courses, the channel each maps to and how its last import went: how many people it read and when, or why it stopped short. The reasons are:

- An address the platform names that the app refuses.
- A scope the platform did not grant, or a refused token or member list.
- A failed read, while the import tries again and once it gave up.
- A list longer than one import reads.
- The member limit.
- A connection, organization or course that is not active.

## Embedded pages

A launch ends on a page under `/embed`: the app without its navigation, account menu or links out of the frame. These are the only pages another site may frame, and only the origins your mode lists may do so.

The embedded session lives in a cookie of its own, kept per platform site by the browser. It accepts a change only from the app's own pages, never from another frame on the platform's page. The embedded app keeps its own user, local data and realtime connection, apart from a tab of the app opened beside it.

The template ships the organization's embedded page. An app that maps a course to a channel of its own adds an embedded route for that channel and names it in its pinned [routes-config.tsx](../../frontend/src/routes-config.tsx).

## When it fails

- **A platform without platform storage:** the launch stops and asks the person to contact the platform's administrator.
- **A browser that cannot keep the embedded session:** the page says so and names the browsers that can, such as Chrome, Edge and Firefox.
- **A course not set up yet:** a student who arrives before any instructor is asked to have an instructor open it first.
- **A full organization:** a person who would be a new member while the tenant's member limit leaves no seat is refused with a page. Someone who is a member already is never refused for it.
- **An archived course:** the launch is refused, as joining it is.
- **A disabled LTI tool:** its tab on the platform says it cannot be opened until an admin enables it again, and its tokens stop at their next request.
- **A scope taken away:** a token that carries it is refused at its next request. A new token carries what the admin still grants.
- **An import that stops short:** the course under LTI connections says why, and the members imported before stay.
- **A deployment the connection does not hold:** the launch is refused, and an organization admin registers the app for that deployment.
- **A deleted connection:** the LTI tool refuses the platform's launches as from a platform it is not connected to, and the sessions its launches started end.

## Not built

- The roster, grade and deep linking services of LTI. Reading course members through the platform's own API is built, for a platform on the template.
- Acting for a person on the platform: an installed LTI tool's token acts only as itself.
- Launch state in a cookie: the platform's storage is the only place for it.
- Registrations that every tenant may install: each registration belongs to one tenant.
- Binding an embedded page to the frame that launched it: a page on the platform's own origin can frame an embedded page under the person's session.
- Canvas as a platform, which the app refuses: its configuration address is not under its issuer, and its sign-in host is not the host that frames the page.

## Try it locally

Development turns both roles on, and `pnpm seed` connects two seeded organizations. The first organization the seeded admin manages is the platform: it shows a tab named after the second, which is registered there as an LTI tool, approved with the name released and reading members granted.

Open that tab to land in the second organization inside the frame, as a new person carrying your name. Moments later the jobs worker imports the first organization's members into the second, with their names.

To walk the registration by hand, create a registration link under LTI connections in one organization, paste it under LTI tools in another, approve the LTI tool and add its tab.
