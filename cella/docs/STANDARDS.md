# Standards

This document lists the open standards the template follows, where each one applies and how far.

### TL;DR

Other systems reach your app through standards they already speak: a client generated from OpenAPI, an AI assistant over MCP, a learning platform over LTI. Most standards below are followed in full. A row that stops short says where, and a draft standard is marked as one.

## API

| Standard | Where it applies | How far |
| --- | --- | --- |
| [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.0) | One document describes every route and generates the SDK and the API docs | In full |
| [aep.dev](https://aep.dev) | Resource names, standard methods, custom methods and page tokens | As far as an offline-first app allows |
| [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110) | `ETag`, `If-Match` and `If-None-Match` on a single channel or product | In full |
| [RFC 7396](https://www.rfc-editor.org/rfc/rfc7396) | A `PATCH` is a merge patch | Channels; a product update sends field operations |
| [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) | Every error body | In full |
| [RateLimit header fields](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/), IETF draft | What a rate-limit budget has left | Reads |

## Authorization

| Standard | Where it applies | How far |
| --- | --- | --- |
| [OAuth 2.1](https://oauth.net/2.1/) | The app's own authorization server | In full |
| [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636) | PKCE on every authorization code | In full |
| [RFC 8414](https://www.rfc-editor.org/rfc/rfc8414) and [RFC 9728](https://www.rfc-editor.org/rfc/rfc9728) | The server and resource metadata a client discovers | In full |
| [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707) | A token names one tenant's API or one organization's MCP endpoint | In full |
| [Client ID Metadata Document](https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/), IETF draft | An MCP client names itself by the URL of its metadata | In full; registration by RFC 7591 is not served |
| [MCP](https://modelcontextprotocol.io) | One endpoint per organization | In full |

## Identity

| Standard | Where it applies | How far |
| --- | --- | --- |
| [OpenID Connect](https://openid.net/developers/how-connect-works/) | Institution sign-in through a federation | In full |
| [WebAuthn](https://www.w3.org/TR/webauthn/) | Passkeys, as the first or the second factor | In full |
| [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238) | Authenticator apps (TOTP) | In full |

## Embedding

| Standard | Where it applies | How far |
| --- | --- | --- |
| [LTI 1.3](https://www.1edtech.org/standards/lti) | Both roles: the platform and the LTI tool | Without the grade and deep linking services |
| [LTI Dynamic Registration](https://www.imsglobal.org/spec/lti-dr/v1p0) | Connecting two apps by one pasted address | In full |
| [NRPS](https://www.imsglobal.org/spec/lti-nrps/v2p0) | The members of a context | Without a resource link's members |

## Realtime and files

| Standard | Where it applies | How far |
| --- | --- | --- |
| [Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html) | The live change stream | In full |
| [RFC 6455](https://www.rfc-editor.org/rfc/rfc6455) | The Yjs relay's connection | In full |
| [tus](https://tus.io) | Resumable uploads through Transloadit | In full |

## Messaging

| Standard | Where it applies | How far |
| --- | --- | --- |
| [RFC 8030](https://www.rfc-editor.org/rfc/rfc8030), [RFC 8291](https://www.rfc-editor.org/rfc/rfc8291) and [RFC 8292](https://www.rfc-editor.org/rfc/rfc8292) | Web Push to each device a user turns it on for | In full |
| [RFC 8058](https://www.rfc-editor.org/rfc/rfc8058) | One-click unsubscribe in an email with an unsubscribe link | In full |

## Data and operations

| Standard | Where it applies | How far |
| --- | --- | --- |
| [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562) | UUID v7 entity and change ids, minted where the edit is made, the device included | In full |
| [OpenTelemetry](https://opentelemetry.io/) | Traces, metrics and logs over OTLP | In full |
| [W3C Trace Context](https://www.w3.org/TR/trace-context/) | `traceparent` from the browser to the backend | In full |

## Accessibility and agents

| Standard | Where it applies | How far |
| --- | --- | --- |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Level AA: the audit and the accessibility statement | The conformance report is a draft |
| [AGENTS.md](https://agents.md) | Instructions for coding agents in the repository | In full |
