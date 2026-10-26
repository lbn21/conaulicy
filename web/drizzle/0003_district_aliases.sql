CREATE TABLE "district_alias_streets" (
	"alias_id" text NOT NULL,
	"street_id" text NOT NULL,
	"confidence" text NOT NULL,
	"part" text,
	"source_url" text,
	CONSTRAINT "district_alias_streets_alias_id_street_id_pk" PRIMARY KEY("alias_id","street_id"),
	CONSTRAINT "district_alias_streets_confidence" CHECK ("district_alias_streets"."confidence" in ('high', 'medium'))
);
--> statement-breakpoint
CREATE TABLE "district_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"locality_id" text NOT NULL,
	"teryt_simc" text,
	"name" text NOT NULL,
	"variants" text[] NOT NULL,
	"confidence" text NOT NULL,
	"source_url" text NOT NULL,
	CONSTRAINT "district_aliases_confidence" CHECK ("district_aliases"."confidence" in ('high', 'medium'))
);
--> statement-breakpoint
ALTER TABLE "district_alias_streets" ADD CONSTRAINT "district_alias_streets_alias_id_district_aliases_id_fk" FOREIGN KEY ("alias_id") REFERENCES "public"."district_aliases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "district_alias_streets_street_id_index" ON "district_alias_streets" USING btree ("street_id");--> statement-breakpoint
CREATE INDEX "district_aliases_locality_id_index" ON "district_aliases" USING btree ("locality_id");