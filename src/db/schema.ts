import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Enum values mirror docs/RISK_ENGINE.md §1 (sources) and §7 (flag object).
export const sexEnum = pgEnum("sex", ["female", "male"]);
export const observationSourceEnum = pgEnum("observation_source", [
  "lab",
  "device_photo",
  "meal_photo",
  "chat",
  "intake",
  "manual",
  "synthetic",
]);
export const conditionEnum = pgEnum("condition", [
  "t2d",
  "ckd",
  "htn",
  "masld",
  "mets",
  "osa",
  "engagement",
]);
export const flagKindEnum = pgEnum("flag_kind", [
  "threshold",
  "trend",
  "score",
  "symptom_cluster",
  "changepoint",
  "cooccurrence",
  "sleep",
  "gap",
]);
export const severityEnum = pgEnum("severity", ["monitor", "review", "urgent"]);
export const flagStatusEnum = pgEnum("flag_status", ["new", "validated", "dismissed"]);

export const clinicians = pgTable("clinicians", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
});

export const patients = pgTable("patients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  dob: date("dob").notNull(),
  sex: sexEnum("sex").notNull(),
  clinicianId: uuid("clinician_id")
    .notNull()
    .references(() => clinicians.id),
  intake: jsonb("intake").$type<Record<string, unknown>>().notNull().default({}),
  // CLAUDE.md §4: demo data is synthetic and labeled as such. Row-level marker for patients;
  // observations carry source = 'synthetic'.
  synthetic: boolean("synthetic").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Hypertable on ts (converted in src/db/timescale.ts). `value` is double precision because
// the toolkit's stats_agg takes float8. No primary key: a hypertable unique index must include ts.
export const observations = pgTable(
  "observations",
  {
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    metric: text("metric").notNull(),
    value: doublePrecision("value").notNull(),
    unit: text("unit").notNull(),
    source: observationSourceEnum("source").notNull(),
    confidence: real("confidence").notNull().default(1),
    rawRef: text("raw_ref"),
  },
  (t) => [index("observations_patient_metric_ts_idx").on(t.patientId, t.metric, t.ts.desc())],
);

export const meals = pgTable(
  "meals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    photoUrl: text("photo_url"),
    items: jsonb("items").$type<unknown[]>().notNull().default([]),
    kcal: real("kcal"),
    carbsG: real("carbs_g"),
    proteinG: real("protein_g"),
    fatG: real("fat_g"),
    fibreG: real("fibre_g"),
    sodiumMg: real("sodium_mg"),
    confidence: real("confidence").notNull().default(0),
  },
  (t) => [index("meals_patient_ts_idx").on(t.patientId, t.ts.desc())],
);

export const symptomLogs = pgTable(
  "symptom_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    text: text("text").notNull(),
    codes: jsonb("codes").$type<unknown[]>().notNull().default([]),
    redFlag: boolean("red_flag").notNull().default(false),
  },
  (t) => [index("symptom_logs_patient_ts_idx").on(t.patientId, t.ts.desc())],
);

export const labReports = pgTable(
  "lab_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull(),
    fileUrl: text("file_url"),
    extracted: jsonb("extracted").$type<unknown>().notNull().default({}),
  },
  (t) => [index("lab_reports_patient_collected_idx").on(t.patientId, t.collectedAt.desc())],
);

// Mirrors the Flag object in docs/RISK_ENGINE.md §7. `points` and `contributions` are the
// priority-points ledger shown in the why panel; `kind` is the biggest contributing layer.
export const flags = pgTable(
  "flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    condition: conditionEnum("condition").notNull(),
    kind: flagKindEnum("kind").notNull(),
    severity: severityEnum("severity").notNull(),
    title: text("title").notNull(),
    points: integer("points").notNull().default(0),
    contributions: jsonb("contributions").$type<unknown[]>().notNull().default([]),
    evidence: jsonb("evidence").$type<unknown[]>().notNull().default([]),
    rule: text("rule").notNull(),
    sourceIds: text("source_ids").array().notNull().default([]),
    status: flagStatusEnum("status").notNull().default("new"),
    clinicianNote: text("clinician_note"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("flags_patient_status_idx").on(t.patientId, t.status)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    // CLAUDE.md §4: only a validated flag can trigger a patient message.
    flagId: uuid("flag_id")
      .notNull()
      .references(() => flags.id),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    body: text("body").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [index("messages_patient_ts_idx").on(t.patientId, t.ts.desc())],
);
