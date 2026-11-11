-- Below the generated statements: a pending OAuth sign-up names its provider under `provider`, as the identity it becomes does.
UPDATE "tokens" SET "pending_sign_up" = ("pending_sign_up" - 'issuer') || jsonb_build_object('provider', "pending_sign_up" -> 'issuer') WHERE "pending_sign_up" ? 'issuer';--> statement-breakpoint
