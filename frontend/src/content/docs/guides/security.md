---
title: Security policy
description: How to report a vulnerability and what cella does to stay secure.
order: 3
keywords: security, vulnerability, disclosure
---

## Reporting a vulnerability

If you have a security issue to report, please contact us at [security@cellajs.com](mailto:security@cellajs.com).

## Security monitoring

- `pnpm cella audit` — check for outdated packages, known CVEs, and unneeded `pnpm.overrides`
- `pnpm test:full` — run full test suite including authentication guards, RBAC, and protected route enforcement

## Resources

- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [OWASP Top 10](https://owasp.org/Top10/2025/)
- [Anti-DDoS fundamentals (Scaleway)](https://www.scaleway.com/en/blog/the-fundamentals-of-anti-ddos-protection/)
