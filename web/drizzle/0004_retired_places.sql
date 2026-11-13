ALTER TABLE "localities" ADD COLUMN "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "localities" ADD COLUMN "replaced_by" text;--> statement-breakpoint
ALTER TABLE "streets" ADD COLUMN "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "streets" ADD COLUMN "replaced_by" text;