-- A new tenant stores `{}` and reads the running config. A tenant that exists keeps what it stores: one created on an
-- earlier default allows unregistered clients until a system admin turns that off for it.
ALTER TABLE "tenants" ALTER COLUMN "restrictions" SET DEFAULT '{}';--> statement-breakpoint
-- A cap of 0 meant unlimited until cella#1888 (deny by default) made it refuse: a stored one keeps the meaning it had.
-- No release served that code before this migration, so no stored 0 means refuse yet.
UPDATE "tenants" SET "restrictions" = "restrictions" || (
  SELECT jsonb_object_agg("part", (SELECT jsonb_object_agg("key", CASE WHEN "value" = '0' THEN '"unlimited"' ELSE "value" END) FROM jsonb_each("restrictions" -> "part")))
  FROM unnest(ARRAY['quotas', 'rateLimits']) AS "part"
  WHERE jsonb_typeof("restrictions" -> "part") = 'object' AND "restrictions" -> "part" <> '{}'
)
WHERE jsonb_path_exists("restrictions", '$.quotas.* ? (@ == 0)') OR jsonb_path_exists("restrictions", '$.rateLimits.* ? (@ == 0)');
