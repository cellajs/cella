# Institutional sign-in

This document explains how a tenant connects an institution and what a sign-in through its identity federation does.

### TL;DR

Institutions sign their members in through an identity federation (`sso`), SURFconext first. A tenant trusts an
institution through a connection, and a first sign-in can create the account and its membership. A tenant can require
the people it knows through that connection to sign in this way.

## Vocabulary

| Concept | Meaning |
| --- | --- |
| **Federation** | Declared in `appConfig.federations` as public metadata. Its key is also the session strategy, the identities issuer slug and the env prefix of the client this deployment registered there (`SSO_<KEY>_CLIENT_ID`, `SSO_<KEY>_CLIENT_SECRET`). A mode config can point a key at the federation's test issuer. |
| **Connection** | A tenant's trust in one institution (`backend/src/modules/connections/`): the federation, the institution's domains and IdPs, a status that stays `pending` until the institution activated the app at the federation, and `jitProvisioning`. System admins manage connections per tenant, and a domain belongs to one connection. |
| **Entry** | The connection's id is the public entry key. `/auth/sso/:connectionId` is the link an institution shares, pinned to its IdPs. Starting from the federation goes without a pin, so the federation's own picker lists the connected institutions. |
| **Callback** | One redirect URI, registered at every federation. A state cookie says which federation and connection a round trip belongs to. |

## Signing in

A sign-in at the callback:

1. **Verifies** the `id_token` in full and reads userinfo.
2. **Asserts the institution.** The connection the round trip started from, or the active connection whose domains hold the asserted value, must accept the claim. Otherwise the sign-in is refused.
3. **Finds or creates the account.** The identity is the federation's issuer and subject. A first sign-in creates the account with its address proven by the institution. It is refused without an address, when an account already holds the address (see below), or when neither the connection's `jitProvisioning` nor an invitation admits the address.
4. **Makes it a member** of the tenant's organization, unless an invitation to that organization already names the role.
5. **Records the method.** The session carries the federation and the connection, which the tenant's sign-in policy reads.

A connect links the institution account to a signed-in user, as a provider connect does. Where the federation operates the mailboxes it asserts (`addressAuthority`), a changed institutional address joins the account's `emails`; a magic link later resumes from there.

## The membership role

The role of that membershipcomes from `roleFromClaims` (`backend/src/modules/auth/sso/role-from-claims.ts`), a pinned file an app fills to map what the institution asserts, such as `eduperson_affiliation`, to its own organization roles. The default is the least-privileged role. It is asked once, when the membership is created; later sign-ins never change a role.

## An existing account

A person who signed up before their institution was connected, or whose identifier at the institution changed, is refused, and the error page offers a sign-in link for ten minutes. It mails a magic link to the asserted address, and the link lands on the account page with an offer to connect the institution account. The address never travels in a URL, and no one can ask for the link without first signing in at the institution. Without the `magic` strategy the page keeps its plain sign-in button.

## Where SSO shows

SSO shows on the entry pagean institution shares; on the authenticate page, as "sign in with <institution>" when an invitation names an organization whose tenant has an active connection, and as one "sign in with your institution" button per federation with a connected institution; on the account page, as a connect button per institution of the user's organizations; and in the tenant sheet, where system admins manage connections and the tenant's allowed sign-in methods.

## Tenant sign-in policy

`tenants.authStrategies` (empty = every enabled method) is enforced by `tenantGuard`. A person who holds an identity through the tenant's connection must act with an allowed method, by session or by a delegated token, else 403 `sso_required` with the connection and its entry path in `meta`. Externals without such an identity are untouched. System admins are exempt, also while they act as a user through an impersonation.

A delegated token carries the method and connection of the session that consented, so a token minted from a magic-link session cannot bypass a tenant that requires SSO. An address proven through a federation inherits the policy for magic links: while the tenant excludes `magic`, a magic link for that address is not sent, and the address gets a mail pointing to the institution's sign-in instead. The request answers 204 as for any address, except to a browser that signed in to that account before, which gets `sso_required`. The user keeps every other method and address. The recovery link above is the one exception, and only for a collision at the connection that governs the address: it takes the institution account and the mailbox together.
