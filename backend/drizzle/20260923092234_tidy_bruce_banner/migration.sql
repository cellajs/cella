-- sessions, tokens and unsubscribe_tokens leave partitioning: they are small, retention is a nightly
-- DELETE in maintain_partitions(), and a primary key on (id) alone is impossible on a table
-- partitioned by another column. Databases that a previous migration partitioned are flattened
-- first: a plain copy takes over the name, keeping data, defaults, foreign keys, indexes and
-- triggers. Untouched databases (never partitioned) skip straight to the key change below.
DO $$
DECLARE
  tbl text;
  ddl text;
  fk_defs text[];
  idx_defs text[];
  trg_defs text[];
BEGIN
  FOREACH tbl IN ARRAY ARRAY['sessions', 'tokens', 'unsubscribe_tokens'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_partitioned_table pt JOIN pg_class c ON c.oid = pt.partrelid
      WHERE c.relname = tbl AND c.relnamespace = 'public'::regnamespace
    ) THEN
      CONTINUE;
    END IF;

    -- Definitions are captured before the rename so they name the final table
    SELECT COALESCE(array_agg(format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', tbl, con.conname, pg_get_constraintdef(con.oid))), '{}')
      INTO fk_defs
      FROM pg_constraint con
      WHERE con.conrelid = format('public.%I', tbl)::regclass AND con.contype = 'f';
    SELECT COALESCE(array_agg(pg_get_indexdef(i.indexrelid)), '{}') INTO idx_defs
      FROM pg_index i
      WHERE i.indrelid = format('public.%I', tbl)::regclass
        AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid);
    SELECT COALESCE(array_agg(pg_get_triggerdef(t.oid)), '{}') INTO trg_defs
      FROM pg_trigger t
      WHERE t.tgrelid = format('public.%I', tbl)::regclass AND NOT t.tgisinternal;

    EXECUTE format('ALTER TABLE public.%I RENAME TO %I', tbl, tbl || '_part');
    EXECUTE format('CREATE TABLE public.%I (LIKE public.%I INCLUDING ALL EXCLUDING INDEXES)', tbl, tbl || '_part');
    EXECUTE format('INSERT INTO public.%I SELECT * FROM public.%I', tbl, tbl || '_part');
    -- Drops the partitions with it and frees the index names for the replay
    EXECUTE format('DROP TABLE public.%I CASCADE', tbl || '_part');
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I PRIMARY KEY (id)', tbl, tbl || '_pkey');
    FOREACH ddl IN ARRAY fk_defs LOOP EXECUTE ddl; END LOOP;
    FOREACH ddl IN ARRAY idx_defs LOOP EXECUTE ddl; END LOOP;
    FOREACH ddl IN ARRAY trg_defs LOOP EXECUTE ddl; END LOOP;
    RAISE NOTICE '% flattened to a plain table', tbl;
  END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_pkey";--> statement-breakpoint
ALTER TABLE "sessions" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "tokens" DROP CONSTRAINT "tokens_pkey";--> statement-breakpoint
ALTER TABLE "tokens" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "unsubscribe_tokens" DROP CONSTRAINT "unsubscribe_tokens_pkey";--> statement-breakpoint
ALTER TABLE "unsubscribe_tokens" ADD PRIMARY KEY ("id");
