-- After the generated statement that sets the `tenants.restrictions` default, and only while no deploy of the app has
-- served the deny-by-default code (cella#1888): from then on a stored 0 may be a deliberate refusal. An app whose own
-- upgrade migration already turned stored zeros into 'unlimited' leaves this out.

-- A cap of 0 meant unlimited and now refuses: every one a tenant stores, an app's own entity types included, keeps the meaning it had.
UPDATE "tenants" SET "restrictions" = "restrictions" || (
  SELECT jsonb_object_agg("part", (SELECT jsonb_object_agg("key", CASE WHEN "value" = '0' THEN '"unlimited"' ELSE "value" END) FROM jsonb_each("restrictions" -> "part")))
  FROM unnest(ARRAY['quotas', 'rateLimits']) AS "part"
  WHERE jsonb_typeof("restrictions" -> "part") = 'object' AND "restrictions" -> "part" <> '{}'
)
WHERE jsonb_path_exists("restrictions", '$.quotas.* ? (@ == 0)') OR jsonb_path_exists("restrictions", '$.rateLimits.* ? (@ == 0)');
