CREATE TABLE "import_changes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "import_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"batch_id" text NOT NULL,
	"event_id" text NOT NULL,
	"op" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	CONSTRAINT "import_changes_op" CHECK ("import_changes"."op" in ('insert', 'update', 'delete'))
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"dry_run" boolean DEFAULT false NOT NULL,
	"detected_via" text,
	"files_seen" integer DEFAULT 0 NOT NULL,
	"files_changed" integer DEFAULT 0 NOT NULL,
	"events_added" integer DEFAULT 0 NOT NULL,
	"events_removed" integer DEFAULT 0 NOT NULL,
	"events_changed" integer DEFAULT 0 NOT NULL,
	"batch_id" text,
	"error" text,
	"actions_run_url" text,
	CONSTRAINT "import_runs_status" CHECK ("import_runs"."status" in ('no_change', 'applied', 'needs_review', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "source_files" (
	"sha256" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"url" text NOT NULL,
	"media_id" integer,
	"modified_gmt" text,
	"doc" text NOT NULL,
	"s3_key" text,
	"settled_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_pages" (
	"url" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"hash" text NOT NULL,
	"links" jsonb NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"changed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "import_changes_batch_id_index" ON "import_changes" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "import_runs_started_at_index" ON "import_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "source_files_source_media_id_index" ON "source_files" USING btree ("source","media_id");