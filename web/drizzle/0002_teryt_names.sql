CREATE TABLE "place_redirects" (
	"old_id" text PRIMARY KEY NOT NULL,
	"new_id" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "streets" ADD COLUMN "nazwa_1" text;--> statement-breakpoint
ALTER TABLE "streets" ADD COLUMN "nazwa_2" text;