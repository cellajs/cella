-- A demo session is an anonymous session: the strategy of an account without an identity, which a demo mints.
UPDATE "sessions" SET "auth_strategy" = 'anonymous' WHERE "auth_strategy" = 'demo';
