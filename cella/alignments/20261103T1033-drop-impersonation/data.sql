-- Stored impersonation rows go before the column that marked them: a leftover row would read as a session of the user's own.
DELETE FROM "sessions" WHERE "type" = 'impersonation';--> statement-breakpoint
