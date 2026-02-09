ALTER POLICY "organizations_select_policy" ON "organizations" TO public USING (
        current_setting('app.is_authenticated', true)::boolean = true
        AND COALESCE(current_setting('app.user_id', true), '') != ''
        AND (
          "organizations"."created_by" = current_setting('app.user_id', true)::text
          OR EXISTS (
            SELECT 1 FROM memberships m
            WHERE m.organization_id = "organizations"."id"
            AND m.user_id = current_setting('app.user_id', true)::text
            AND m.tenant_id = "organizations"."tenant_id"
          )
        )
      );