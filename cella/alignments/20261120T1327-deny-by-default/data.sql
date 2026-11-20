-- After the generated statements of step 6, or in the app's next migration once that one has run.

-- A cap of 0 meant unlimited and now refuses: every one a tenant stores, an app's own entity types included, keeps that meaning.
UPDATE "tenants" SET "restrictions" = "restrictions" || (
  SELECT jsonb_object_agg("part", (SELECT jsonb_object_agg("key", CASE WHEN "value" = '0' THEN '"unlimited"' ELSE "value" END) FROM jsonb_each("restrictions" -> "part")))
  FROM unnest(ARRAY['quotas', 'rateLimits']) AS "part"
  WHERE jsonb_typeof("restrictions" -> "part") = 'object' AND "restrictions" -> "part" <> '{}'
)
WHERE jsonb_path_exists("restrictions", '$.quotas.* ? (@ == 0)') OR jsonb_path_exists("restrictions", '$.rateLimits.* ? (@ == 0)');
