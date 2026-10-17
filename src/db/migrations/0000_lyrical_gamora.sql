CREATE TYPE "public"."condition" AS ENUM('t2d', 'ckd', 'htn', 'masld', 'mets', 'osa', 'engagement');--> statement-breakpoint
CREATE TYPE "public"."flag_kind" AS ENUM('threshold', 'trend', 'score', 'symptom_cluster', 'changepoint', 'cooccurrence', 'sleep', 'gap');--> statement-breakpoint
CREATE TYPE "public"."flag_status" AS ENUM('new', 'validated', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."observation_source" AS ENUM('lab', 'device_photo', 'meal_photo', 'chat', 'intake', 'manual', 'synthetic');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('monitor', 'review', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('female', 'male');--> statement-breakpoint
CREATE TABLE "clinicians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"condition" "condition" NOT NULL,
	"kind" "flag_kind" NOT NULL,
	"severity" "severity" NOT NULL,
	"title" text NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"contributions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rule" text NOT NULL,
	"source_ids" text[] DEFAULT '{}' NOT NULL,
	"status" "flag_status" DEFAULT 'new' NOT NULL,
	"clinician_note" text,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lab_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"collected_at" timestamp with time zone NOT NULL,
	"file_url" text,
	"extracted" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"photo_url" text,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kcal" real,
	"carbs_g" real,
	"protein_g" real,
	"fat_g" real,
	"fibre_g" real,
	"sodium_mg" real,
	"confidence" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"flag_id" uuid NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"patient_id" uuid NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"metric" text NOT NULL,
	"value" double precision NOT NULL,
	"unit" text NOT NULL,
	"source" "observation_source" NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	"raw_ref" text
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"dob" date NOT NULL,
	"sex" "sex" NOT NULL,
	"clinician_id" uuid NOT NULL,
	"intake" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synthetic" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "symptom_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"text" text NOT NULL,
	"codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"red_flag" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_reports" ADD CONSTRAINT "lab_reports_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_flag_id_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."flags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_clinician_id_clinicians_id_fk" FOREIGN KEY ("clinician_id") REFERENCES "public"."clinicians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symptom_logs" ADD CONSTRAINT "symptom_logs_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flags_patient_status_idx" ON "flags" USING btree ("patient_id","status");--> statement-breakpoint
CREATE INDEX "lab_reports_patient_collected_idx" ON "lab_reports" USING btree ("patient_id","collected_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "meals_patient_ts_idx" ON "meals" USING btree ("patient_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "messages_patient_ts_idx" ON "messages" USING btree ("patient_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "observations_patient_metric_ts_idx" ON "observations" USING btree ("patient_id","metric","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "symptom_logs_patient_ts_idx" ON "symptom_logs" USING btree ("patient_id","ts" DESC NULLS LAST);