# Security Policy

## Reporting a vulnerability

Report security issues to [security@cellajs.com](mailto:security@cellajs.com).

## Security monitoring

- `pnpm cella audit`: reports outdated packages, known CVEs, and unneeded `pnpm.overrides`; `pnpm cella audit fix` asks which to take and writes them
- `pnpm test:full`: full suite including authentication guards, RBAC, and protected route enforcement

## Resources

- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [OWASP Top 10](https://owasp.org/Top10/2025/)
- [Anti-DDoS fundamentals (Scaleway)](https://www.scaleway.com/en/blog/the-fundamentals-of-anti-ddos-protection/)
