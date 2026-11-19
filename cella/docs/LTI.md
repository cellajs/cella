# LTI

This document covers [LTI 1.3](https://www.1edtech.org/standards/lti): how your app opens other apps inside its pages, and how a learning platform opens your app inside a course.

### TL;DR

LTI lets one app, the platform, open another, the LTI tool, in a frame on its page, signed in as the same person in the same course. The template plays both roles, each off until a mode turns it on. Two admins connect their apps by pasting one address, and from then on a launch is a click on a tab. What a course becomes in your app, and what its roles mean, you decide in two app-owned files.

## Two roles

Your app is a **platform** when it hosts other apps: an admin installs an LTI tool and approves it, and a channel switches its tab on. Turn it on with `has.ltiPlatform`, which lets the app frame any HTTPS origin.

Your app is an **LTI tool** when a learning platform, such as another app on the template, opens it inside a course. Turn it on with the `lti` sign-in method, and list the origins of the platforms that may frame it in `ltiFrameAncestors`.

An app can be both. As a platform, it needs the [OAuth worker](./OAUTH.md) on: it signs launches and serves the platform's addresses. It stores the addresses the LTI tool registers and fetches only its key set, to check the LTI tool's token requests. As an LTI tool, the app needs the API and the [jobs worker](./JOBS.md) alone, and fetches the platform's configuration and keys server to server. Outside development, each needs a public HTTPS address.

## Registration

One pasted address connects two apps, by LTI Dynamic Registration, whichever side your app is on. Connections and installations belong to the organization's tenant, and only someone who may update the organization manages them. Adding or approving one asks for a recent second factor.

As an LTI tool, an admin creates a registration link under LTI connections in organization settings. It works once and for a short while. The platform's admin pastes it where the platform adds an LTI tool by URL. The app reads the platform's configuration, registers itself there and lists the platform as a connection.

Each connection gets a key pair of its own, and the registration names that connection's key set on the API. The app stores the connection, waiting, before it calls the platform: a platform that reads the key set while it registers the app, as Brightspace does, finds it. No key rotation is built. Deleting the connection deletes its key, and its key set answers no more.

A connection still waiting is listed nowhere, and one a failed registration left behind goes after a day. A tenant holds a limited number of LTI connections, a tenant quota: past it, a registration link and a registration are refused with a page that says so.

A course belongs to the connection that launched it first. Two connections of one tenant to the same platform, such as two schools on one hosted platform, both open the course and admit people into it, and only its own connection changes it: its name, its member list and its imports.

Registering the same platform again takes a course over only once the old connection is deleted: the next launch through the new one keeps the course's channel and people. Until then the old connection keeps the course. The platform's existing links still point at the old registration, as a Moodle activity keeps its tool type and client id: re-point them there. A course whose connection is gone shows on no card until a launch takes it over.

A person is known to a tenant by the platform's issuer and their id there. The same person coming through the same platform into two tenants has an account in each: a platform registered in one tenant reaches the accounts made through that tenant alone.

As a platform, an admin pastes the address an LTI tool's admin handed over under LTI tools in organization settings. The LTI tool's registration page opens in a dialog, which closes when the LTI tool says it is done. The new LTI tool then waits for approval.

## Approval

An LTI tool asks for the personal fields it wants: name, email, picture. When approving, the admin chooses which of them a launch carries, and none is chosen by default. Whatever the admin releases, a launch always carries the person's id (the same for every LTI tool), their role, their language, the channel's name and short name, and the organization's tenant id.

The approval dialog also shows where launches go and the site whose keys act as the LTI tool. Registration refuses an LTI tool whose launch addresses or key set lie off the domains it declares.

An LTI tool may also ask for the scope of an LTI service the app serves, today Names and Role Provisioning Services (NRPS), which lists a course's members. The app records it as the access scope it stands for, `user:read`. The approval dialog lists it under API access, none chosen by default. What the admin grants, the LTI tool does on its own: it asks no person, and it reaches only the courses where it has a tab.

The admin changes the grant later on the LTI tool's tile, which asks the second factor too. Withdrawing a scope asks first, and the LTI tool loses it at its next request.

Rejecting a waiting LTI tool deletes its registration. Disabling an approved one stops its launches and its tokens at once, and enabling it again asks for the second factor. An installed LTI tool is a service account without API keys: it shows in the LTI tools card, never among the API keys.

## Tabs

A channel's Tabs card, in its settings, lists every approved LTI tool of the tenant among the channel's own tabs. Whoever may update the channel switches an LTI tool's tab on or off and drags it among the others, and the tab bar follows that one order. A channel holds one tab of an LTI tool, named after it.

Switching a tab on takes the right to update the channel and, when the tab launches as a course above it, that course. Someone without it sees the row off, with the reason. When the LTI tool may read course members, the card asks first, naming the course whose people it will read and saying when that course is the one above. Switching the tab off removes it.

Under LTI tools in organization settings, each LTI tool lists the channels where it has a tab, each a link. An admin sees there every course whose people the LTI tool reads, and removes a tab from any channel they may update.

## A launch

A person opens an LTI tool's tab on the platform. From that click to the page inside the frame:

1. The platform checks that the person may read the channel now, and records a launch that works once.
2. The frame posts a login to the LTI tool, which keeps its state in the platform's storage through the frame.
3. The platform signs a statement of who the person is, the course, their roles and the released fields.
4. The LTI tool checks the signature and its state, finds or creates the person, and sets their role in the course.
5. The LTI tool starts an embedded session and shows the course's embedded page in the frame.

The platform's storage replaces a cookie for the launch state. Every launch checks the person's standing anew: someone who left the course is refused at their next click.

## Serving course members

An installed LTI tool reads a course's members as itself, by [NRPS 2.0](https://www.imsglobal.org/spec/lti-nrps/v2p0), within the scopes the admin granted. It asks the OAuth worker for a token with the NRPS scope and an assertion signed by a key of the set it registered. Like any LTI tool, it names no resource: the token is for the tenant's API, carries `user:read` and acts as the installation.

Its reach follows its tabs, read at every request for the course the address names. A tab gives the installation the least privileged role of its course: the channel a launch names as its context, also when the tab sits in a channel below it. Removing the last tab, or the channel, takes that away. Nothing about a tab is stored on the installation.

A launch with a course carries the NRPS claim to an LTI tool granted `user:read`: the course's membership address and the service version, 2.0. A launch without a course, or of an LTI tool granted nothing, carries none.

At that address, the token lists the course's members as far as its role sees them, in the NRPS membership container. Each member is the person's id, the same a launch sends, their LTI roles there, the status Active and the personal fields the admin released, by their NRPS names.

A page holds about what `limit` asks, never fewer than 25, a `Link` header leads to the next, and `role` keeps one LTI role. A request for one tab's members (`rlid`) is refused.

The platform's configuration offers the NRPS scope and names its issuer as the authorization server, which an LTI tool addresses its assertion to.

## Courses and roles

A course on the platform is an LTI context. As an LTI tool, your app maps each context to one of its channels in [lti-context-channel.ts](../../backend/src/modules/auth/flows/lti/lti-context-channel.ts). The template maps every context to the organization, with its least privileged role.

An app whose course is a channel below the organization names that channel type there. It creates the channel on an instructor's first launch, named after the course, and maps LTI roles to the channel's roles at every launch. A role in such a channel follows the platform up and down. An organization role only goes up, and never to one that may update the organization, as the permission engine decides.

A person who arrives for the first time gets an account without a proven email address, and takes a seat of the tenant's member limit. An email the platform releases never links them to an existing account. An account named before the platform released a name takes the name a later launch or import brings, as long as nothing else signs it in.

As a platform, your app says in [launch-context.ts](../../backend/src/modules/lti-platform/launch-context.ts) which channels are LTI contexts and which LTI roles a person's permissions there send. The template sends every channel as a group. Whoever may update the context's channel goes as Instructor, whoever may only read it as Learner, as the permission engine decides with the person's access at launch.

## Reading course members

As an LTI tool, your app also reads who is in a course by NRPS, before any of them launched. It asks for the NRPS scope when it registers. A platform that grants nothing still launches it.

The import starts when an Instructor or Administrator of the course launches, once a launch carried the NRPS claim. A launch without the claim keeps the member list an earlier one named, as Moodle names it on some launch paths only. A platform that refuses the scope or the member list makes the app forget it until a launch names it again.

The import runs on the [jobs worker](./JOBS.md), at most once in a short while per course and for a limited number of courses per connection an hour, and the launch never waits for it. A course past that number says its import waits, unless its last import was refused in a way only the platform or a new registration changes. No button starts one: the next such launch after that while does.

Imports of one connection run one after the other, and those of different connections beside each other, each within a time budget: a platform that answers slowly holds up its own imports alone.

It reads each member's id, their LTI roles in the course, and their name and email address where the platform's admin released them. A member the platform lists as Inactive is not added. A context role the platform names by its short name, as Sakai does, reads as its full URI; institution and system roles reach the app's role mapping as they come.

Before it signs or fetches anything, the app holds to these rules:

- The membership address comes from a verified launch of that connection.
- A next page stays on the origin and path of the address the launch named.
- A token request is signed with the connection's own key, for the audience the platform's configuration names.
- A token is kept per connection and sent to that connection's membership addresses alone.
- Every request goes through the guarded fetch, which reaches public HTTPS addresses only.

So members are read from any platform that registers the app by Dynamic Registration and serves NRPS. That is tested end to end against a platform on the template. The registration and the reader are tested against answers shaped like the code of hosted Canvas and Moodle, which no live Canvas, Moodle, Sakai or Brightspace confirmed. No launch from Canvas has been tried, and members are read only after a launch: nothing from Canvas is confirmed end to end.

Each person listed gets the account their own launch finds later, and the role a launch would give them, by the same rules. The import adds and updates, and never removes anyone: who left the course stays a member until an admin removes them.

The platform decides who is in a course. A person an admin removes in your app is added again by the next launch or import while the platform lists them: remove them on the platform.

The import writes as a service account of the connection, which no admin manages. Deleting the connection disables it, and it stays out of the admins' reach: no admin turns it on again or gives it an API key. A person who needs a seat when the member limit leaves none is left out, and the import goes on with the rest.

Under LTI connections, each connection lists its courses, the channel each maps to and how its last import went: how many people it read and when, or why it stopped short. The reasons are:

- A connection registered before it held a key of its own, which registers again.
- An address the platform names that the app refuses.
- A scope the platform did not grant, or a refused token or member list: any client error but a timeout or a throttle.
- A failed import, while it tries again and once it gave up.
- A list longer than one import reads.
- The member limit.
- A connection, organization or course that is not active.
- A connection that read as many courses as it may in an hour: the import waits.

## Embedded pages

A launch ends on a page under `/embed`: the app without its navigation, account menu or links out of the frame. These are the only pages another site may frame, and only the origins your mode lists may do so.

The embedded session lives in a cookie of its own, kept per platform site by the browser. It accepts a change only from the app's own pages, never from another frame on the platform's page. The embedded app keeps its own user, local data and realtime connection, apart from a tab of the app opened beside it.

The template ships the organization's embedded page. An app that maps a course to a channel of its own adds an embedded route for that channel and names it in its pinned [routes-config.tsx](../../frontend/src/routes-config.tsx).

## When it fails

- **A platform without platform storage:** the launch stops and asks the person to contact the platform's administrator.
- **A browser that cannot keep the embedded session:** the page says so and names the browsers that can, such as Chrome, Edge and Firefox.
- **A course not set up yet:** a student who arrives before any instructor is asked to have an instructor open it first.
- **A full organization:** a person who would be a new member while the tenant's member limit leaves no seat is refused with a page. Someone who is a member already is never refused for it.
- **An archived course:** a member gets in with the role they hold. Anyone the launch would add is refused with a page, as joining it is.
- **A disabled LTI tool:** its tab on the platform says it cannot be opened until an admin enables it again, and its tokens stop at their next request.
- **A scope taken away:** a token that carries it is refused at its next request. A new token carries what the admin still grants.
- **An import that stops short:** the course under LTI connections says why, and the members imported before stay.
- **A deployment the connection does not hold:** the launch is refused, and an organization admin registers the app for that deployment.
- **A deleted connection:** the LTI tool refuses the platform's launches as from a platform it is not connected to, and the sessions its launches started end.
- **A connection without a key of its own:** it launches as before, and its courses under LTI connections ask to register the app at the platform again before members are read.
- **A tenant at its quota of LTI connections:** a new registration link is refused, and so is a registration through a link made before, with a page that says so.

## Not built

- The grade and deep linking services of LTI.
- Of NRPS, a resource link's members (`rlid`, which the platform refuses) and the differences link.
- Rotating a connection's key: registering the app again gives a new one.
- Acting for a person on the platform: an installed LTI tool's token acts only as itself.
- Launch state in a cookie: the platform's storage is the only place for it.
- Registrations that every tenant may install: each registration belongs to one tenant.
- Binding an embedded page to the frame that launched it: a page on the platform's own origin can frame an embedded page under the person's session.
- Launches from Canvas: its sign-in host is not the host that frames the page.

## Try it locally

Development turns both roles on, and `pnpm seed` connects two seeded organizations. The first organization the seeded admin manages is the platform: it shows a tab named after the second, which is registered there as an LTI tool, approved with the name released and reading members granted.

Open that tab to land in the second organization inside the frame, as a new person carrying your name. Moments later the jobs worker imports the first organization's members into the second, with their names.

To walk the registration by hand, create a registration link under LTI connections in one organization, paste it under LTI tools in another, approve the LTI tool and switch its tab on in the Tabs card of the organization's settings.
