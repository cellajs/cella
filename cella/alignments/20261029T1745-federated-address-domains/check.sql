-- Addresses whose last proof was a sign-in through a federation, on none of the domains (or their subdomains) of the
-- account's connections at that federation. Read-only: each row is a decision for the app, keeping it is the default.
SELECT e.email, e.user_id, e.last_verified_via, e.last_verified_at
FROM emails e
WHERE e.last_verified_via IN (SELECT DISTINCT issuer FROM connections)
  AND NOT EXISTS (
    SELECT 1
    FROM identities i
    JOIN connections c ON c.id = i.connection_id
    CROSS JOIN LATERAL unnest(c.claim_values) AS d(domain)
    WHERE i.user_id = e.user_id
      AND i.kind = 'sso'
      AND i.issuer = e.last_verified_via
      AND (
        substring(e.email FROM '@([^@]*)$') = d.domain
        OR right(substring(e.email FROM '@([^@]*)$'), length(d.domain) + 1) = '.' || d.domain
      )
  )
ORDER BY e.last_verified_at DESC;
