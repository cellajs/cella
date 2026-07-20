## DNS Zone Activation

`ensure-dns-zone.ts` checks that the app's DNS zone is hosted on Scaleway DNS before the Pulumi DNS and load-balancer modules create CAA, A, and CNAME records.

When the domain is registered elsewhere, Scaleway zone activation requires two manual changes at the current DNS provider. Scaleway cannot apply them because it is not authoritative for the domain yet.

- Add the TXT challenge record Scaleway sends for `_scaleway-challenge.<domain>`. The per-domain token must land within 48 hours or the registration is dropped. Scaleway validates the token with a public DNS lookup and activates the zone once it resolves.
- Delegate the domain NS records to `ns0.dom.scw.cloud` and `ns1.dom.scw.cloud` so Pulumi-managed records resolve from Scaleway DNS.

The helper lists DNS zones and returns when the apex zone is active. If the zone is missing, it posts to `/external-domains`; `409` and `403 already in process` mean a registration already exists and validation should continue. The operator then follows the Scaleway email with the exact records to add and uses the recheck prompt until the zone flips to `active`.
