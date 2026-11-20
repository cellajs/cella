-- A new tenant stores `{}` and reads the running config. A tenant that exists keeps what it stores: one created on an
-- earlier default allows unregistered clients until a system admin turns that off for it.
ALTER TABLE "tenants" ALTER COLUMN "restrictions" SET DEFAULT '{}';--> statement-breakpoint
-- A cap of 0 meant unlimited until 20261120132001_dazzling_shinobi_shaw made it refuse: a stored one keeps that meaning.
UPDATE "tenants" SET "restrictions" = "restrictions" || (
  SELECT jsonb_object_agg("part", (SELECT jsonb_object_agg("key", CASE WHEN "value" = '0' THEN '"unlimited"' ELSE "value" END) FROM jsonb_each("restrictions" -> "part")))
  FROM unnest(ARRAY['quotas', 'rateLimits']) AS "part"
  WHERE jsonb_typeof("restrictions" -> "part") = 'object' AND "restrictions" -> "part" <> '{}'
)
WHERE jsonb_path_exists("restrictions", '$.quotas.* ? (@ == 0)') OR jsonb_path_exists("restrictions", '$.rateLimits.* ? (@ == 0)');
