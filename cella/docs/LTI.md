# LTI

This document covers [LTI 1.3](https://www.1edtech.org/standards/lti): how your app opens other apps inside its pages, and how another app or a learning platform opens yours.

### TL;DR

LTI lets one app, the platform, open another, the LTI tool, in a frame on its page, signed in as the same person in the same place. The template plays both roles, each off until a mode turns it on. Two admins connect their apps by pasting one address, and from then on a launch is a click on a tab. What that place becomes in your app, and what its roles mean, you decide in two app-owned files.

## Two roles

Your app is a **platform** when it hosts other apps: an admin installs an LTI tool and approves it, and a channel switches its tab on. Turn it on with `has.ltiPlatform`, which lets the app frame any HTTPS origin.

Your app is an **LTI tool** when a platform, such as a learning platform or another app on the template, opens it inside one of its pages. Turn it on with the `lti` sign-in method, and list the origins of the platforms that may frame it in `ltiFrameAncestors`.

An app can be both. As a platform, it needs the [OAuth worker](./OAUTH.md) on: it signs launches and serves the platform's addresses. It stores the addresses the LTI tool registers and fetches only its key set, to check the LTI tool's token requests. As an LTI tool, the app needs the API and the [jobs worker](./JOBS.md) alone, and fetches the platform's configuration and keys server to server. Outside development, each needs a public HTTPS address.

## Registration

One pasted address connects two apps, by LTI Dynamic Registration, whichever side your app is on. Connections and installations belong to the organization's tenant, and only someone who may update the organization manages them. Adding or approving one asks for a recent second factor.

As an LTI tool, an admin creates a registration link under LTI connections in organization settings. It works once and for a short while. The platform's admin pastes it where the platform adds an LTI tool by URL. The app reads the platform's configuration, registers itself there and lists the platform as a connection.

Each connection gets a key pair of its own, and the registration names that connection's key set on the API. The app stores the connection, waiting, before it calls the platform: a platform that reads the key set while it registers the app, as Brightspace does, finds it. No key rotation is built. Deleting the connection deletes its key, and its key set answers no more.

A connection still waiting is listed nowhere, and one a failed registration left behind goes after a day. A tenant holds a limited number of LTI connections, a tenant quota: past it, a registration link and a registration are refused with a page that says so.

A refused registration's page says why, in words the platform's admin can act on, and stays open until they close it. A refusal the app decides alone leaves the link for another try: a link not valid, a tenant at its quota, or a configuration address the app does not contact. Once the app has asked the platform, every outcome takes a new link, and the page says which of the two it is.

A context belongs to the connection that launched it first. Two connections of one tenant to the same platform, such as two schools on one hosted platform, both open the context and admit people into it, and only its own connection changes it: its name, its member list and its imports.

Registering the same platform again takes a context over only once the old connection is deleted: the next launch through the new one keeps the context's channel and people. Until then the old connection keeps the context. The platform's existing links still point at the old registration, as a Moodle activity keeps its tool type and client id: re-point them there. A context whose connection is gone shows on no card until a launch takes it over.

A person is known to a tenant by the platform's issuer and their id there. The same person coming through the same platform into two tenants has an account in each: a platform registered in one tenant reaches the accounts made through that tenant alone.

As a platform, an admin pastes the address an LTI tool's admin handed over under LTI tools in organization settings. The LTI tool's registration page opens in a dialog, which closes when the LTI tool says it is done. The new LTI tool then waits for approval. An LTI tool that closes its page without registering leaves the dialog open, saying so.

## Approval

An LTI tool asks for the personal fields it wants: name, email, picture. When approving, the admin chooses which of them a launch carries, and none is chosen by default. Whatever the admin releases, a launch always carries the person's id (the same for every LTI tool), their role, their language, the channel's name and short name, and the organization's tenant id.

The approval dialog also shows where launches go and the site whose keys act as the LTI tool. Registration refuses an LTI tool whose launch addresses or key set lie off the domains it declares.

An LTI tool may also ask for the scope of an LTI service the app serves, today Names and Role Provisioning Services (NRPS), which lists a context's members. The app records it as the access scope it stands for, `user:read`. The approval dialog lists it under API access, none chosen by default.

What the admin grants, the LTI tool does on its own: it asks no person, and it reaches only the LTI contexts where it has a tab that opens.

The admin also chooses where the LTI tool may get a tab: the channel types, of those that hold LTI tabs, none chosen by default. The admin changes them later on the tile, with the second factor. Taking a type away leaves the LTI tool's tabs there as they are, and they stop opening until the type is allowed again.

Allowing a type again, or enabling a disabled LTI tool, asks first when tabs that are on would open again, and says how many.

The admin changes the grant later on the LTI tool's tile, which asks the second factor too. Withdrawing a scope or a channel type asks first, and the LTI tool loses it at its next request.

Rejecting a waiting LTI tool deletes it in whatever state it is by then, also when another admin approved it a moment before. Disabling an approved one stops its launches and its tokens at once, and enabling it again asks for the second factor. An installed LTI tool is a service account without API keys: it shows in the LTI tools card, never among the API keys.

An approved or disabled LTI tool is deleted on its tile, as a waiting one is rejected, and both ask for the second factor. Deleting asks first, naming its tabs: its registration, its tabs and its access go, and adding it again takes a new registration. Two LTI tools of one name, such as an LTI tool registered again, show when each was added, and in a channel's Tabs card where its launches go.

## Tabs

A channel's Tabs card, in its settings, lists every approved LTI tool of the tenant that the admin allowed in the channel's type, among the channel's own tabs. An LTI tool disabled or no longer allowed there shows only where it has a tab, cannot be switched on, and says why its tab does not open. An archived channel's settings list no tabs: the start of a launch, the launch and the LTI tool's tile say that it is archived.

Whoever may update the channel switches an LTI tool's tab on or off and drags it among the others, and the tab bar follows that one order. A channel holds one tab of an LTI tool, named after it, and with it one audience.

The first switch on places the tab. From then on it keeps one id, whatever is switched, which the LTI tool keys what it stores for the tab by. A tab is shown, launches and lets the LTI tool read who is in its channel only while it is on. No tab of an LTI tool opens by itself: a page lands on one of the channel's own tabs.

A tab launches as its own channel. Only a channel type the app makes an LTI context holds LTI tabs, and the organization, whose tabs launch without a context when it is no context. A tab in any other channel type is never offered, and one placed before stops launching.

Switching a tab on asks whom it opens for, its audience:

- **Its members:** whoever holds a membership in the channel. Someone who may read or change the channel without being its member does not see it. These are exactly the people the LTI tool reads there.
- **Only those who can change the channel:** whoever may update it, as the permission engine decides, a member or not, such as an admin of what it sits in.

The tab list, the start of a launch and the launch itself check the audience alike, and someone outside it is refused as for a tab that does not exist. The audience bounds who opens the tab, not whom the LTI tool reads: with members granted, it reads every member either way, and the question says so. The tab's row in the Tabs card changes its audience later.

Under LTI tools in organization settings, each LTI tool lists its tabs, each a link to its channel with whom it opens for, the ones switched off marked off, and why one that is on does not open. An admin removes a tab there for good, after a confirmation: what the LTI tool keeps for the tab may be lost.

## A launch

A person opens an LTI tool's tab on the platform. From that click to the page inside the frame:

1. The platform checks that the person may read the channel now and is in the tab's audience, and records a launch that works once.
2. The frame posts a login to the LTI tool, which keeps its state in the platform's storage through the frame.
3. The platform checks again and signs a statement of who the person is, the tab's channel as the context, their roles and the released fields.
4. The LTI tool checks the signature and its state, finds or creates the person, and sets their role in the channel the context maps to.
5. The LTI tool starts an embedded session and shows that channel's embedded page in the frame.

The platform's storage replaces a cookie for the launch state. Every launch checks the person's standing anew: someone who left the channel is refused at their next click.

## Serving members

An installed LTI tool reads the members of an LTI context as itself, by [NRPS 2.0](https://www.imsglobal.org/spec/lti-nrps/v2p0), within the scopes the admin granted. It asks the OAuth worker for a token with the NRPS scope and an assertion signed by a key of the set it registered. Like any LTI tool, it names no resource: the token is for the tenant's API, carries `user:read` and acts as the installation.

Its reach follows its tabs that open, read at every request for the channel the address names. A tab gives the installation the least privileged role of its own channel, when that channel is an LTI context, and nothing in a channel above or below it. Nothing about a tab is stored on the installation.

Whatever keeps the tab from opening takes that away: switching it off or removing it, a disabled LTI tool, a withdrawn channel type, an archive, or deleting the channel. An archive takes it away once each process reads the organization's archived channels again, shortly after.

A launch with a context carries the NRPS claim to an LTI tool granted `user:read`: the context's membership address and the service version, 2.0. A launch without a context, or of an LTI tool granted nothing, carries none.

At that address, the token lists the context's members as far as its role sees them, in the NRPS membership container. Each member is the person's id, the same a launch sends, their context roles there, decided by their own membership as a launch on a tab for its members decides them, the status Active and the personal fields the admin released, by their NRPS names.

A page holds about what `limit` asks, never fewer than 25, a `Link` header leads to the next, and `role` keeps one LTI role. A request for one tab's members (`rlid`) is refused.

The platform's configuration offers the NRPS scope and names its issuer as the authorization server, which an LTI tool addresses its assertion to.

## Contexts and roles

A course, a group or another place on the platform that people are members of is an LTI context. As an LTI tool, your app maps each context to one of its channel types in [lti-context-channel.ts](../../backend/src/modules/auth/flows/lti/lti-context-channel.ts), or to none. The template maps a course or a group, or a context that names no type, to the organization. Any other context, such as Canvas's account and user navigation, counts as none.

An app whose contexts are channels below the organization names that channel type there, and may name another for a group. The first launch by someone who sets the context up creates the channel, named after the context, and every launch maps LTI roles to the channel's roles. A role in such a channel follows the platform up and down. An organization role only goes up, and never to one that may update the organization, as the permission engine decides.

Every context mapped to a channel type gets a channel of its own: a platform's course section becomes one too, unless the app maps it to none.

The mapping also decides who sets a context up: whoever it gives a role that may update a channel of that type, as the permission engine judges that role alone. Their launch creates the channel of a context nobody opened yet, and starts its member import.

The mapping gets the roles as the platform sent them. Canvas sends the institution role Administrator to anyone who administers one of its accounts, with no context role where they are not enrolled. The template gives institution and system roles alone no role: such an admin is refused and sets nothing up. An app may answer them itself.

The role mapping may give no role, which refuses the launch with a page and leaves the person out of an import. The template's mapping has three cases:

- **Instructor or Administrator of the context:** the channel's most privileged role: they set it up. In the organization they get the highest role below one that may update it.
- **Any other context role:** the channel's least privileged role.
- **Institution or system roles alone, or no roles at all:** no role, and the launch is refused.

A launch without a context admits nobody new. It signs in a person this tenant already knows from the same platform as a member of the organization, from a launch in a context or an import, and changes no membership, role or seat. Anyone else gets a page that says the app opens from a page they are a member of.

A person a context admits also becomes a member of the organization, at its least privileged role, and a launch without a context lands a known person on the organization's embedded page. An app whose contexts sit below the organization decides what that role sees of people ([What members see](./PERMISSIONS.md#what-members-see)) and what that page shows.

A person who arrives for the first time gets an account without a proven email address, and takes a seat of the tenant's member limit. An email the platform releases never links them to an existing account. An account named before the platform released a name takes the name a later launch or import brings, as long as nothing else signs it in.

As a platform, your app says in [launch-context.ts](../../backend/src/modules/lti-platform/launch-context.ts) which channel types are LTI contexts and which LTI roles a person goes there with. The template sends every channel as a group, so its seeded pair works. Whoever may update the channel goes as Instructor, whoever may only read it as Learner.

A list of roles the app sends that is not empty holds a LIS role, as LTI requires: the backend does not start while an answer in that file would send one without.

The audience that lets a person in is what their roles are judged by. On a tab for its members, their one membership in the channel decides alone: power from a channel above, such as an organization admin's, adds nothing. On a tab for its editors, all they may do there decides, a membership or not. The function also gets the person's role in the channel, or none: an app tells roles with the same rights apart by it.

The member list an LTI tool reads holds members alone, each with the roles their own membership gives.

Every launch also carries institution roles from the same file, with or without a context, from the person's membership in the organization. The template sends Administrator to whoever may update the organization and nothing to anyone else. A plain member's launch without a context then carries no roles.

The institution role tells an LTI tool who is an organization admin, as Canvas does. Some LTI tools, such as Moodle's, treat an institution Administrator as an instructor in every context: an app that wants none answers none.

## Outside education

LTI comes from education: its places are courses and groups, and its roles Instructor and Learner. Two kinds of pair work outside a school: an app on the template inside another, in any domain, and an app on the template inside a learning platform of any sector, such as corporate training.

Outside a school, an Instructor is whoever runs a place, a Learner whoever takes part in it, and a Group any place with members. The template sends every channel as a Group, which fits a project or a team as well as a class.

`roles` holds LIS roles only: an app picks its own from the whole LIS vocabulary, which holds Manager, Member and Officer beside the teaching roles. An LTI tool not on the template may read the teaching roles alone, as Moodle's takes a Manager as a learner: an app sends its own choice beside Instructor or Learner.

The template's texts call the place a page, and keep the word LTI for admins. An education app puts its own words, such as course and teacher, back through `app.json`.

## Reading members

As an LTI tool, your app also reads who is in a context by NRPS, before any of them launched. It asks for the NRPS scope when it registers. A platform that grants nothing still launches it.

The import starts when someone who sets the context up launches, once a launch carried the NRPS claim. A launch without the claim keeps the member list an earlier one named, as Moodle names it on some launch paths only. A platform that refuses the scope or the member list makes the app forget it until a launch names it again.

The import runs on the [jobs worker](./JOBS.md), at most once in a short while per context, and the launch never waits for it. A connection imports a limited number of different contexts in any hour: a class whose teams each have a tab fits. Each read stops at a limit of pages and of people, and what an import adds is bounded by the tenant's seats.

A context past either number says its import waits, unless its last import was refused in a way only the platform or a new registration changes. No button starts one: the next such launch after that while does.

Imports of one connection run one after the other, and those of different connections beside each other, each within a time budget: a platform that answers slowly holds up its own imports alone.

It reads each member's id, their LTI roles in the context, and their name and email address where the platform's admin released them. A member the platform lists as Inactive is not added. A context role the platform names by its short name, as Sakai does, reads as its full URI, and any other short name is no LIS role. Institution and system roles reach the app's role mapping as they come, as at a launch.

Before it signs or fetches anything, the app holds to these rules:

- The membership address comes from a verified launch of that connection.
- A next page stays on the origin and path of the address the launch named.
- A token request is signed with the connection's own key, for the audience the platform's configuration names.
- A token is kept per connection and sent to that connection's membership addresses alone.
- Every request goes through the guarded fetch, which reaches public HTTPS addresses only.

So members are read from any platform that registers the app by Dynamic Registration and serves NRPS. That is tested end to end against a platform on the template. The registration and the reader are tested against answers shaped like the code of hosted Canvas and Moodle, which no live Canvas, Moodle, Sakai or Brightspace confirmed. No launch from Canvas has been tried, and members are read only after a launch: nothing from Canvas is confirmed end to end.

Each person listed gets the account their own launch finds later, and the role a launch would give them, by the same rules. The import adds and updates, and never removes anyone: who left the context stays a member until an admin removes them.

The platform decides who is in a context. A person an admin removes in your app is added again by the next launch or import while the platform lists them: remove them on the platform.

The import writes as a service account of the connection, which no admin manages. Deleting the connection disables it, and it stays out of the admins' reach: no admin turns it on again or gives it an API key. A person who needs a seat when the member limit leaves none is left out, and the import goes on with the rest.

Under LTI connections, each connection lists its LTI contexts, the channel each maps to and how its last import went: how many people it read and when, or why it stopped short. The reasons are:

- A connection registered before it held a key of its own, which registers again.
- An address the platform names that the app refuses.
- A scope the platform did not grant, or a refused token or member list: any client error but a timeout or a throttle.
- A failed import, while it tries again and once it gave up.
- A list longer than one import reads.
- The member limit.
- People the platform sent no role the app takes, who are left out.
- A connection or organization that is not active, or a context whose channel is archived.
- A connection that imported as many contexts as it may within the last hour: the import waits.

## Embedded pages

A launch ends on a page under `/embed`: the app without its navigation, account menu or links out of the frame. These are the only pages another site may frame, and only the origins your mode lists may do so.

The embedded session lives in a cookie of its own, kept per platform site by the browser. It accepts a change only from the app's own pages, never from another frame on the platform's page. The embedded app keeps its own user, local data and realtime connection, apart from a tab of the app opened beside it.

The template ships the organization's embedded page. An app that maps a context to a channel of its own adds an embedded route for that channel and names it in its pinned [routes-config.tsx](../../frontend/src/routes-config.tsx).

## When it fails

- **A platform without platform storage:** the launch stops and asks the person to contact the platform's administrator.
- **A browser that cannot keep the embedded session:** the page says so and names the browsers that can, such as Chrome, Edge and Firefox.
- **A context not set up yet:** someone who arrives before anyone who sets it up is told that someone who manages the page on the platform must open it first.
- **A launch without a context:** someone the organization does not know yet is told to open the app from a page they are a member of first.
- **No role the app takes:** a launch with no context role is refused with a page in the template, and nothing is written.
- **A full organization:** a person who would be a new member while the tenant's member limit leaves no seat is refused with a page. Someone who is a member already is never refused for it.
- **An archived context:** a member gets in with the role they hold. Anyone the launch would add is refused with a page, as joining it is.
- **A disabled LTI tool:** its tab on the platform says it cannot be opened until an admin enables it again, and its tokens stop at their next request.
- **A tab switched off or removed:** it leaves the bar, a launch started before is refused, and someone on it lands on the channel's first tab. When the channel shows them no tab of its own, they see its page header alone.
- **Someone outside a tab's audience:** the tab is not in their bar, and its address and a launch started before are refused as for a tab that does not exist.
- **A channel type the admin took away:** the LTI tool's tabs there stay as they are and stop opening, and it reads no members there, until the admin allows the type again.
- **An archived channel:** its LTI tabs do not open and the LTI tool reads no members there, until it is unarchived.
- **A scope taken away:** a token that carries it is refused at its next request. A new token carries what the admin still grants.
- **An import that stops short:** the context under LTI connections says why, and the members imported before stay.
- **A deployment the connection does not hold:** the launch is refused, and an organization admin registers the app for that deployment.
- **A deleted connection:** the LTI tool refuses the platform's launches as from a platform it is not connected to, and the sessions its launches started end.
- **A connection without a key of its own:** it launches as before, and its contexts under LTI connections ask to register the app at the platform again before members are read.
- **A tenant at its quota of LTI connections:** a new registration link is refused, and so is a registration through a link made before, with a page that says so. That link works once a connection is deleted, unless another registration took the last place while it ran.
- **A deleted LTI tool:** its tabs leave every channel, a launch of one is refused as of a tab that does not exist, and its tokens stop at their next request.

## Not built

- The grade and deep linking services of LTI.
- Of NRPS, a resource link's members (`rlid`, which the platform refuses) and the differences link.
- Rotating a connection's key: registering the app again gives a new one.
- Acting for a person on the platform: an installed LTI tool's token acts only as itself.
- Launch state in a cookie: the platform's storage is the only place for it.
- Registrations that every tenant may install: each registration belongs to one tenant.
- Binding an embedded page to the frame that launched it: a page on the platform's own origin can frame an embedded page under the person's session.
- Launches from Canvas: its sign-in host is not the host that frames the page.
- Roles named by the app itself, in the `custom` claim as Canvas sends its own: `roles` holds LIS roles only.

## Try it locally

Development turns both roles on, and `pnpm seed` connects two seeded organizations. The first organization the seeded admin manages is the platform: it shows a tab named after the second, which is registered there as an LTI tool, approved with the name released, reading members granted and the organization allowed.

Open that tab to land in the second organization inside the frame, as a new person carrying your name. Moments later the jobs worker imports the first organization's members into the second, with their names.

To walk the registration by hand, create a registration link under LTI connections in one organization, paste it under LTI tools in another, approve the LTI tool with the organization allowed and switch its tab on in the Tabs card of the organization's settings.

---

Learning Tools Interoperability® (LTI®) is a trademark of the 1EdTech® Consortium, Inc. (1edtech.org).
