# Institutional sign-in

This document explains how a tenant connects an institution and what a sign-in through its identity federation does. It assumes you know OpenID Connect: an identity provider, its issuer and the claims of an ID token ([OpenID Connect](https://openid.net/developers/how-connect-works/)).

### TL;DR

Institutions sign their members in through an identity federation (`sso`), SURFconext first. A tenant trusts an
institution through a connection. A first sign-in can create the account and its membership. A tenant can require
the people it knows through that connection to sign in this way.

## Vocabulary

| Concept | Meaning |
| --- | --- |
| **Federation** | Declared in `appConfig.federations` as public metadata. This deployment's client there comes from `SSO_<KEY>_CLIENT_ID` and `SSO_<KEY>_CLIENT_SECRET`. |
| **Connection** | A tenant's trust in one institution: its federation, domains, IdPs, status and `jitProvisioning`. It stays `pending` until the institution activates the app at the federation. A domain belongs to one connection. |
| **Entry** | `/auth/sso/:connectionId`, the link an institution shares, pinned to its IdPs. A start from the federation has no pin. The federation's own picker then lists the connected institutions. |
| **Callback** | One redirect URI, registered at every federation. |

## Signing in

At the callback, an active connection must accept the institution the claims assert. The identity is the federation's issuer and subject. A first sign-in creates the account only with the connection's `jitProvisioning` or an invitation.

The institution proves an address only on the connection's domains or their subdomains. It does so only where the federation vouches for its institutions' mailboxes, since the federation passes any address an identity provider releases.

A first sign-in with any other address is refused with the offer below. A magic link then proves the inbox before an account holds it. An eduID account, whose address can have any domain, proves none this way.

With `jitProvisioning` the account becomes a member of the tenant's organization. When an invitation there already names the role, the membership waits until the invitation is accepted. The session records the federation and the connection. The tenant's sign-in policy counts it only through the tenant's own connection.

A connect links the institution account to a signed-in user, as a provider connect does. With `jitProvisioning` it grants that membership too. A changed address the institution proves joins the account's addresses, on a connect or a later sign-in.

## The membership role

The role of that membership comes from `backend/src/modules/auth/sso/role-from-claims.ts`. An app fills this pinned file to map institution claims, such as `eduperson_affiliation`, to its own organization roles. The default is the least-privileged role. It is asked once, when the membership is created. Later sign-ins never change a role.

## An existing account

The institution's sign-in is refused for:

- a person who signed up before their institution was connected
- a person whose identifier at the institution changed
- a first sign-in with an address the institution does not prove

The error page offers to mail a magic link to the asserted address. The link lands on the account page, which offers to connect the institution account. The address never travels in a URL. No one can ask for the link without first signing in at the institution.

## Where SSO shows

- On the entry page an institution shares.
- On the authenticate page: a "sign in with your institution" button per federation with a connection.
- There too, "sign in with <institution>" for an invitation to a tenant with an active connection.
- On the account page: a connect button per institution of the user's organizations.
- In the tenant sheet, where system admins manage connections and the tenant's allowed sign-in methods.

## Tenant sign-in policy

`tenantGuard` enforces `tenants.authStrategies`, where an empty list allows every enabled method.

A person with an identity through the tenant's connection must act with an allowed method. A federation counts only through that connection. An access token carries the method and connection of the session that consented. Otherwise the request is refused with `sso_required`.

Externals without such an identity are untouched. System admins are exempt.

The policy guards tenant routes only. Under a refused method the person still reads:

- `GET /notifications`: their own inbox, which names the tenant's channels and items
- `GET /organizations`: their organizations
- `/me/memberships`: their memberships
- `GET /users/{id}`: the profiles of their co-members

An address proven through a federation inherits the policy for magic links. While the tenant excludes `magic`, no magic link is sent for that address. The request answers 204 as for any address. The account gets a mail pointing to its institution's sign-in.

Only a browser that signed in to that account before gets `sso_required`. The user keeps every other method and address. The recovery link above is the one exception, since it takes the institution account and the mailbox together.
