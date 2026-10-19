CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"subtype" text NOT NULL,
	"zone_id" text NOT NULL,
	"start" text NOT NULL,
	"end" text,
	"all_day" boolean NOT NULL,
	"label" text NOT NULL,
	"source_doc" text NOT NULL,
	"source_url" text NOT NULL,
	"source_ref" text,
	"source_sha256" text,
	"checked_at" date NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"shifted_from" date,
	"payload" jsonb,
	CONSTRAINT "events_start" CHECK ("events"."start" ~ '^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$')
);
--> statement-breakpoint
CREATE TABLE "gminy" (
	"id" text PRIMARY KEY NOT NULL,
	"teryt" text NOT NULL,
	"name" text NOT NULL,
	"schedule_url" text
);
--> statement-breakpoint
CREATE TABLE "localities" (
	"id" text PRIMARY KEY NOT NULL,
	"gmina_id" text NOT NULL,
	"teryt" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"parent_id" text,
	"search" text NOT NULL,
	CONSTRAINT "localities_kind" CHECK ("localities"."kind" in ('miasto', 'wies', 'czesc_wsi'))
);
--> statement-breakpoint
CREATE TABLE "meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "streets" (
	"id" text PRIMARY KEY NOT NULL,
	"locality_id" text NOT NULL,
	"teryt" text,
	"prefix" text NOT NULL,
	"name" text NOT NULL,
	"house_from" text,
	"house_to" text,
	"parity" text,
	"search" text NOT NULL,
	CONSTRAINT "streets_parity" CHECK ("streets"."parity" in ('even', 'odd'))
);
--> statement-breakpoint
CREATE TABLE "zone_members" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "zone_members_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"zone_id" text NOT NULL,
	"locality_id" text NOT NULL,
	"street_id" text,
	"house_from" text,
	"house_to" text,
	"parity" text,
	CONSTRAINT "zone_members_parity" CHECK ("zone_members"."parity" in ('even', 'odd'))
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "localities" ADD CONSTRAINT "localities_gmina_id_gminy_id_fk" FOREIGN KEY ("gmina_id") REFERENCES "public"."gminy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "localities" ADD CONSTRAINT "localities_parent_id_localities_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."localities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streets" ADD CONSTRAINT "streets_locality_id_localities_id_fk" FOREIGN KEY ("locality_id") REFERENCES "public"."localities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_members" ADD CONSTRAINT "zone_members_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_members" ADD CONSTRAINT "zone_members_locality_id_localities_id_fk" FOREIGN KEY ("locality_id") REFERENCES "public"."localities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_members" ADD CONSTRAINT "zone_members_street_id_streets_id_fk" FOREIGN KEY ("street_id") REFERENCES "public"."streets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_zone_id_start_index" ON "events" USING btree ("zone_id","start");--> statement-breakpoint
CREATE INDEX "localities_gmina_id_index" ON "localities" USING btree ("gmina_id");--> statement-breakpoint
CREATE INDEX "streets_locality_id_index" ON "streets" USING btree ("locality_id");--> statement-breakpoint
CREATE INDEX "zone_members_street_id_index" ON "zone_members" USING btree ("street_id");--> statement-breakpoint
CREATE INDEX "zone_members_locality_id_index" ON "zone_members" USING btree ("locality_id");