# Institutional sign-in

This document explains how a tenant connects an institution and what a sign-in through its identity federation does.

### TL;DR

Institutions sign their members in through an identity federation (`sso`), SURFconext first. A tenant trusts an
institution through a connection, and a first sign-in can create the account and its membership. A tenant can require
the people it knows through that connection to sign in this way.

## Vocabulary

| Concept | Meaning |
| --- | --- |
| **Federation** | Declared in `appConfig.federations` as public metadata. The client this deployment registered there comes from `SSO_<KEY>_CLIENT_ID` and `SSO_<KEY>_CLIENT_SECRET`. A mode config can point a key at the federation's test issuer. |
| **Connection** | A tenant's trust in one institution (`backend/src/modules/connections/`): the federation, the institution's domains and IdPs, a status that stays `pending` until the institution activated the app at the federation, and `jitProvisioning`. A domain belongs to one connection. |
| **Entry** | `/auth/sso/:connectionId`, the link an institution shares, pinned to its IdPs. Starting from the federation goes without a pin, so the federation's own picker lists the connected institutions. |
| **Callback** | One redirect URI, registered at every federation. |

## Signing in

At the callback, a connection must accept the institution: the connection the round trip started from, or the active connection whose domains hold the asserted value. The identity is the federation's issuer and subject. A first sign-in creates the account only with the connection's `jitProvisioning` or an invitation.

The institution proves an address only on one of the connection's domains or their subdomains, and only where the federation operates its institutions' mailboxes (`addressAuthority`): the federation passes any address an identity provider releases. A first sign-in with any other address is refused with the offer below, so a magic link proves the inbox before an account holds it. An eduID account, whose address can have any domain, proves none this way.

With `jitProvisioning` the account becomes a member of the tenant's organization, unless an invitation to that organization already names the role. The session records the federation and the connection, and the tenant's sign-in policy counts it only through the tenant's own connection.

A connect links the institution account to a signed-in user, as a provider connect does, and grants that membership too with `jitProvisioning`. A changed address the institution proves is added to the account's addresses, on a connect and on a later sign-in.

## The membership role

The role of that membership comes from `backend/src/modules/auth/sso/role-from-claims.ts`, a pinned file an app fills to map what the institution asserts, such as `eduperson_affiliation`, to its own organization roles. The default is the least-privileged role. It is asked once, when the membership is created; later sign-ins never change a role.

## An existing account

A person who signed up before their institution was connected, or whose identifier at the institution changed, is refused, and so is a first sign-in with an address the institution does not prove. The error page offers to mail a magic link to the asserted address, which lands on the account page with an offer to connect the institution account. The address never travels in a URL, and no one can ask for the link without first signing in at the institution.

## Where SSO shows

- On the entry page an institution shares.
- On the authenticate page: "sign in with <institution>" for an invitation to a tenant with an active connection, and one "sign in with your institution" button per federation with a connected institution.
- On the account page: a connect button per institution of the user's organizations.
- In the tenant sheet, where system admins manage connections and the tenant's allowed sign-in methods.

## Tenant sign-in policy

`tenants.authStrategies` (empty = every enabled method) is enforced by `tenantGuard`. A person who holds an identity through the tenant's connection must act with an allowed method, and with a federation only through that connection, by session or by an access token, which carries the method and connection of the session that consented. Otherwise the request is refused with `sso_required`. Externals without such an identity are untouched. System admins are exempt, also while they act as a user through an impersonation.

The policy guards tenant routes only. Under a refused method the person still reads their own inbox (`GET /notifications`, which names the tenant's channels and items), their organizations (`GET /organizations`), their memberships (`/me/memberships`) and the profiles of their co-members (`GET /users/{id}`).

An address proven through a federation inherits the policy for magic links: while the tenant excludes `magic`, no magic link is sent for that address. The request answers 204 as for any address and mails the account a pointer to its institution's sign-in; only a browser that signed in to that account before gets `sso_required`. The user keeps every other method and address. The recovery link above is the one exception, for a collision at the connection that governs the address: it takes the institution account and the mailbox together.
