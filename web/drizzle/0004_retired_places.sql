ALTER TABLE "localities" ADD COLUMN IF NOT EXISTS "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "localities" ADD COLUMN IF NOT EXISTS "replaced_by" text;--> statement-breakpoint
ALTER TABLE "streets" ADD COLUMN IF NOT EXISTS "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "streets" ADD COLUMN IF NOT EXISTS "replaced_by" text;--> statement-breakpoint
-- The import's role (conaulicy_import, docs/database.md) reads what the
-- dataset snapshot holds (t402): the redirects and the district tables, and
-- the new columns where it reads streets and localities by column. A no-op
-- where the role does not exist (CI, a local database). GRANT is idempotent.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'conaulicy_import') THEN
    GRANT SELECT ON "place_redirects", "district_aliases", "district_alias_streets" TO conaulicy_import;
    IF NOT has_table_privilege('conaulicy_import', 'streets', 'SELECT') THEN
      GRANT SELECT ("retired_at", "replaced_by") ON "streets" TO conaulicy_import;
    END IF;
    IF NOT has_table_privilege('conaulicy_import', 'localities', 'SELECT') THEN
      GRANT SELECT ("retired_at", "replaced_by") ON "localities" TO conaulicy_import;
    END IF;
  END IF;
END
$$;
