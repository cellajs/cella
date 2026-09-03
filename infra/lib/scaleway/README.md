## DNS Zone Activation

`ensure-dns-zone.ts` checks that the app's DNS zone is hosted on Scaleway DNS before the Pulumi DNS and load-balancer modules create CAA, A, and CNAME records.

When the domain is registered elsewhere, activation needs two manual changes at the current DNS provider, because Scaleway is not yet authoritative:

- Add the TXT challenge record Scaleway sends for `_scaleway-challenge.<domain>`. The token must land within 48 hours or the registration is dropped. Scaleway validates it with a public DNS lookup and activates the zone once it resolves.
- Delegate the domain NS records to `ns0.dom.scw.cloud` and `ns1.dom.scw.cloud` so Pulumi-managed records resolve from Scaleway DNS.

The helper lists DNS zones and returns when the apex zone is active. If the zone is missing it posts to `/external-domains`; `409` and `403 already in process` mean a registration exists and validation continues. The operator follows the Scaleway email with the exact records and uses the recheck prompt until the zone flips to `active`.
