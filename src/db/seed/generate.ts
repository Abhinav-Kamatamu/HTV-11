import type { InferInsertModel } from "drizzle-orm";
import { clinicians, labReports, meals, observations, patients, symptomLogs } from "../schema";
import { CLINICIAN_ID, ID_KIND, STORY_IDS, seedId } from "./ids";
import { Rng, subRng } from "./rng";

export const SEED = 20261017;
const DAY = 86_400_000;
const HOUR = 3_600_000;
const VITALS_DAYS = 90;

type Sex = "female" | "male";
export type SeedData = {
  clinicians: InferInsertModel<typeof clinicians>[];
  patients: InferInsertModel<typeof patients>[];
  observations: InferInsertModel<typeof observations>[];
  meals: InferInsertModel<typeof meals>[];
  symptomLogs: InferInsertModel<typeof symptomLogs>[];
  labReports: InferInsertModel<typeof labReports>[];
};

// Metric names and units are the contract with the engine lane (docs/DECISIONS.md).
export const UNITS = {
  hba1c: "%",
  fpg: "mmol/L",
  creatinine: "µmol/L",
  egfr: "mL/min/1.73m²",
  acr: "mg/mmol",
  alt: "U/L",
  ast: "U/L",
  ggt: "U/L",
  platelets: "10^9/L",
  triglycerides: "mmol/L",
  hdl: "mmol/L",
  waist_cm: "cm",
  neck_cm: "cm",
  weight_kg: "kg",
  bp_systolic: "mmHg",
  bp_diastolic: "mmHg",
  resting_hr: "bpm",
  steps: "steps",
  sleep_hours: "h",
  sleep_snoring: "0/1",
  sleep_tired: "0/1",
  sleep_observed_apnea: "0/1",
} as const;
type Metric = keyof typeof UNITS;
type LabMetric = Exclude<
  Metric,
  | "waist_cm" | "neck_cm" | "weight_kg" | "bp_systolic" | "bp_diastolic" | "resting_hr" | "steps" | "sleep_hours"
  | "sleep_snoring" | "sleep_tired" | "sleep_observed_apnea"
>;
const LAB_METRICS: LabMetric[] = [
  "hba1c", "fpg", "creatinine", "egfr", "acr", "alt", "ast", "ggt", "platelets", "triglycerides", "hdl",
];
const SLEEP_CHECKIN_WEEKS = 13;

const round = (x: number, digits: number) => Math.round(x * 10 ** digits) / 10 ** digits;

// CKD-EPI 2021 (race-free). creatinine in µmol/L, result in mL/min/1.73m².
export function ckdEpi2021(creatinineUmol: number, age: number, sex: Sex): number {
  const scr = creatinineUmol / 88.4;
  const kappa = sex === "female" ? 0.7 : 0.9;
  const alpha = sex === "female" ? -0.241 : -0.302;
  return (
    142 *
    Math.min(scr / kappa, 1) ** alpha *
    Math.max(scr / kappa, 1) ** -1.2 *
    0.9938 ** age *
    (sex === "female" ? 1.012 : 1)
  );
}

// Story patients specify an eGFR; invert CKD-EPI (monotone in creatinine) so both stay consistent.
function creatinineForEgfr(egfr: number, age: number, sex: Sex): number {
  let lo = 20;
  let hi = 1500;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (ckdEpi2021(mid, age, sex) > egfr) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

type Profile = {
  num: number;
  name: string;
  sex: Sex;
  age: number;
  story: "A" | "B" | "C" | "urgent" | "silent" | "control";
  labCount: number; // lab points, oldest first
  labIntervalDays?: number; // days between lab draws, default 365 (yearly)
  /** Explicit lab series (oldest first) for story patients. Anything not listed is a flat baseline, with noise on controls only. */
  labs: Partial<Record<LabMetric, number[]>>;
  /** Labs never ordered for this patient, so the engine sees "unknown" rather than a value. */
  skipLabs?: LabMetric[];
  targetEgfr?: number[];
  hba1cPerYear?: number; // controls that drift slowly
  waist: { latest: number; perYear: number };
  vitals: {
    sys: number; dia: number; sysPerDay?: number; weight: number; weightPerDay?: number;
    hr: number; steps: number; sleep: number;
  };
  missingRate: number;
  /** Home BP before `daysAgo` runs at the "before" level, then steps to `vitals.sys/dia` (CUSUM demo). */
  bpStep?: { daysAgo: number; sysBefore: number; diaBefore: number };
  /** Stops logging this many days before the anchor (vitals, sleep check-ins, tape measures). */
  silentDays?: number;
  heightCm: number; // intake; BMI = weight / height² for STOP-Bang and the Fatty Liver Index
  neckCm: number; // intake, asked once
  medications: string[]; // intake; treatment counts as "met" for the BP, TG and HDL criteria
  /** Weekly sleep check-in answers, the same every week for story patients. */
  sleepCheckin: { snoring: 0 | 1; tired: 0 | 1; observedApnea: 0 | 1 };
  symptoms?: { daysAgo: number; text: string; codes: string[]; redFlag?: boolean }[];
  meals?: boolean;
};

const A_SYMPTOMS = [
  [41, "Really thirsty again today, drank about three litres of water.", ["thirst"]],
  [38, "So tired after lunch I could barely keep my eyes open.", ["fatigue"]],
  [34, "Thirsty all evening and up twice in the night to pee.", ["thirst", "nocturia"]],
  [30, "Felt drained all afternoon, not sure why.", ["fatigue"]],
  [26, "Mouth feels dry, constantly reaching for water.", ["thirst"]],
  [22, "Exhausted by 3pm again, slept fine.", ["fatigue"]],
  [17, "Very thirsty after dinner, and tired again.", ["thirst", "fatigue"]],
  [11, "Tired and thirsty most of the week.", ["fatigue", "thirst"]],
  [4, "Another day of being wiped out and thirsty.", ["fatigue", "thirst"]],
] as const;

const STORY_PROFILES: Profile[] = [
  {
    // A: creeping HbA1c (six twice-yearly points, +0.3/yr, every one below 5.5 so each result "looked normal";
    // projected to reach the 6.0 prediabetes line in about 2 years), rising waist.
    num: 1, name: "Priya Nair", sex: "female", age: 52, story: "A", labCount: 6, labIntervalDays: 182,
    labs: {
      hba1c: [4.65, 4.8, 4.95, 5.1, 5.25, 5.4],
      fpg: [4.7, 4.8, 4.9, 5.0, 5.1, 5.2],
      triglycerides: [1.2, 1.3, 1.4, 1.5, 1.6, 1.7],
    },
    targetEgfr: [95, 95, 95, 95, 95, 95],
    waist: { latest: 96, perYear: 4 },
    vitals: { sys: 124, dia: 78, weight: 79, weightPerDay: 0.02, hr: 72, steps: 5200, sleep: 6.8 },
    missingRate: 0.02,
    heightCm: 165, neckCm: 36, medications: [],
    sleepCheckin: { snoring: 1, tired: 1, observedApnea: 0 }, // STOP-Bang 3: S, T, age > 50
    symptoms: A_SYMPTOMS.map(([daysAgo, text, codes]) => ({ daysAgo, text, codes: [...codes] })),
    meals: true,
  },
  {
    // B: eGFR falling ~6/yr while still above 60, ACR rising to A2, home BP stepping from ~126/78 to ~141/88
    // about six weeks ago (the CUSUM change-point).
    num: 2, name: "Marcus Webb", sex: "male", age: 61, story: "B", labCount: 6, labIntervalDays: 182,
    targetEgfr: [88, 85, 82, 79, 76, 73],
    labs: { acr: [1.2, 1.6, 2.0, 2.4, 2.8, 3.2], hba1c: [5.4, 5.4, 5.4, 5.4, 5.4, 5.4] },
    waist: { latest: 101, perYear: 0.5 },
    vitals: { sys: 141, dia: 88, weight: 92, hr: 70, steps: 6100, sleep: 6.9 },
    bpStep: { daysAgo: 42, sysBefore: 126, diaBefore: 78 },
    missingRate: 0.02,
    heightCm: 178, neckCm: 43, medications: [],
    sleepCheckin: { snoring: 1, tired: 1, observedApnea: 1 }, // STOP-Bang 7: S, T, O, P (home BP), age, neck, male
    symptoms: [
      { daysAgo: 20, text: "Ankles a bit swollen by evening.", codes: ["edema"] },
      { daysAgo: 9, text: "Slight headache most mornings this week.", codes: ["headache"] },
    ],
    meals: true,
  },
  {
    // C: ALT/GGT/TG creeping, FIB-4 stays low (about 0.8).
    num: 3, name: "Daniel Okafor", sex: "male", age: 47, story: "C", labCount: 6, labIntervalDays: 182,
    labs: {
      alt: [28, 31, 35, 40, 46, 52],
      ast: [24, 25, 26, 28, 29, 31],
      ggt: [30, 35, 41, 49, 58, 68],
      platelets: [255, 252, 249, 247, 245, 243],
      triglycerides: [1.3, 1.5, 1.7, 1.9, 2.1, 2.2],
    },
    targetEgfr: [100, 100, 100, 100, 100, 100],
    // Metabolic syndrome 3 of 5: waist and triglycerides met, BP met by treatment (home BP is controlled),
    // HDL and fasting glucose never ordered so they are unknown.
    skipLabs: ["hdl", "fpg"],
    waist: { latest: 104, perYear: 3 },
    vitals: { sys: 126, dia: 80, weight: 98, weightPerDay: 0.015, hr: 74, steps: 7000, sleep: 6.5 },
    missingRate: 0.02,
    heightCm: 180, neckCm: 39, medications: ["amlodipine 5 mg"],
    sleepCheckin: { snoring: 0, tired: 0, observedApnea: 0 }, // STOP-Bang 2: male, treated BP
    meals: true,
  },
  {
    // Urgent: red-flag symptom log yesterday on top of high BP and reduced kidney function.
    num: 4, name: "Walter Hughes", sex: "male", age: 68, story: "urgent", labCount: 4,
    targetEgfr: [52, 50, 49, 47],
    labs: { hba1c: [7.0, 7.1, 7.3, 7.4], acr: [5.5, 6.4, 7.2, 8.1] },
    waist: { latest: 109, perYear: 1 },
    vitals: { sys: 152, dia: 94, sysPerDay: 0.2, weight: 96, hr: 80, steps: 3100, sleep: 5.9 },
    missingRate: 0.02,
    heightCm: 175, neckCm: 38, medications: [],
    sleepCheckin: { snoring: 0, tired: 0, observedApnea: 0 },
    symptoms: [
      { daysAgo: 1, text: "Crushing chest pain and short of breath since this morning.", codes: ["chest_pain", "dyspnea"], redFlag: true },
    ],
    meals: true,
  },
];

const FIRST = ["Ava", "Liam", "Noor", "Ethan", "Mei", "Omar", "Sofia", "Jacob", "Amara", "Lucas", "Hana", "Noah", "Zara", "Ravi", "Elena", "Kai", "Grace", "Tariq", "Isla", "Mateo"];
const LAST = ["Chen", "Tremblay", "Singh", "Roy", "Patel", "Gagnon", "Kim", "Morin", "Ahmed", "Lee", "Bouchard", "Santos", "Nguyen", "Fraser", "Haddad", "Wong", "Campbell", "Ali", "Pelletier", "Dubois"];
export const CONTROL_COUNT = 20;
const SLOW_DRIFT_CONTROLS = 3; // the last few controls creep slowly, so the queue is not all flat

function controlProfile(i: number): Profile {
  const rng = subRng(SEED, 100 + i);
  const extra = subRng(SEED, 300 + i); // intake fields on their own stream so they never shift the vitals above
  const sex: Sex = rng.chance(0.5) ? "female" : "male";
  const drifting = i >= CONTROL_COUNT - SLOW_DRIFT_CONTROLS;
  return {
    num: 5 + i,
    name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + 3) % LAST.length]}`,
    sex,
    age: rng.int(30, 75),
    story: "control",
    labCount: rng.int(3, 5),
    labs: {},
    hba1cPerYear: drifting ? 0.05 : 0,
    waist: { latest: round(rng.uniform(sex === "female" ? 76 : 86, sex === "female" ? 90 : 100), 0), perYear: 0 },
    vitals: {
      sys: round(rng.uniform(112, 128), 0),
      // Compressed to 70 to 76 so no control sits on the 130/80 home BP line (diastolic alone would trip it).
      dia: 70 + Math.round((round(rng.uniform(70, 80), 0) - 70) * 0.6),
      weight: round(rng.uniform(sex === "female" ? 58 : 72, sex === "female" ? 78 : 92), 0),
      hr: round(rng.uniform(60, 76), 0),
      steps: round(rng.uniform(5500, 10500), -2),
      sleep: round(rng.uniform(6.8, 8.2), 1),
    },
    missingRate: 0.05,
    heightCm: round(sex === "female" ? extra.uniform(155, 172) : extra.uniform(168, 188), 0),
    neckCm: round(sex === "female" ? extra.uniform(31, 36) : extra.uniform(36, 39.5), 0),
    medications: [],
    sleepCheckin: { snoring: 0, tired: 0, observedApnea: 0 },
  };
}

// Logged every day, then nothing for the last 11 days: the heartbeat / gap layer (RISK_ENGINE §8).
// Her systolic creeps up, so the last trend she has is stale rather than reassuring.
const SILENT_PROFILE: Profile = {
  num: 25, name: "Rosa Delgado", sex: "female", age: 58, story: "silent", labCount: 3,
  labs: {},
  waist: { latest: 84, perYear: 0 },
  vitals: { sys: 120, dia: 74, sysPerDay: 0.12, weight: 70, hr: 68, steps: 6800, sleep: 7.2 },
  missingRate: 0,
  silentDays: 11,
  heightCm: 163, neckCm: 33, medications: [],
  sleepCheckin: { snoring: 0, tired: 0, observedApnea: 0 },
};

export function allProfiles(): Profile[] {
  return [...STORY_PROFILES, ...Array.from({ length: CONTROL_COUNT }, (_, i) => controlProfile(i)), SILENT_PROFILE];
}

const MEALS = [
  { name: "Chicken rice bowl", kcal: 650, carbs: 80, protein: 38, fat: 18, fibre: 5, sodium: 900 },
  { name: "Pepperoni pizza, 2 slices", kcal: 620, carbs: 68, protein: 26, fat: 28, fibre: 4, sodium: 1350 },
  { name: "Oatmeal with berries", kcal: 320, carbs: 55, protein: 10, fat: 6, fibre: 8, sodium: 120 },
  { name: "Salmon, potatoes and salad", kcal: 580, carbs: 42, protein: 36, fat: 26, fibre: 7, sodium: 520 },
  { name: "Instant noodles", kcal: 480, carbs: 62, protein: 10, fat: 20, fibre: 3, sodium: 1700 },
];
const MEAL_DAYS_AGO = [1, 2, 4, 6, 9];

function dateOnly(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function ageAt(dobMs: number, atMs: number): number {
  return (atMs - dobMs) / (365.25 * DAY);
}

function labValue(p: Profile, metric: LabMetric, i: number, rng: Rng, age: number, hdlRng: Rng): number {
  const explicit = p.labs[metric]?.[i];
  if (explicit !== undefined) return explicit;
  const female = p.sex === "female";
  // Noise only on controls. Story patients still draw from the stream (so it stays aligned) but get a flat baseline.
  const noisy = p.story === "control" ? 1 : 0;
  const n = (sd: number) => rng.normal(0, sd) * noisy;
  switch (metric) {
    case "hba1c": return round(5.2 + (p.hba1cPerYear ?? 0) * i + n(0.08), 1);
    case "fpg": return round(5.0 + (p.hba1cPerYear ?? 0) * 2 * i + n(0.15), 1);
    case "creatinine": {
      if (p.targetEgfr) return round(creatinineForEgfr(p.targetEgfr[i], age, p.sex), 0);
      return round((female ? 66 : 82) + n(3), 0);
    }
    case "egfr": return NaN; // derived from creatinine by the caller
    case "acr": return round(Math.max(0.2, 0.6 + n(0.15)), 1);
    case "alt": return round(female ? 20 + n(3) : 26 + n(4), 0);
    case "ast": return round(female ? 20 + n(3) : 24 + n(3), 0);
    case "ggt": return round(female ? 20 + n(4) : 28 + n(5), 0);
    case "platelets": return round(260 + n(15), 0);
    case "triglycerides": return round(Math.max(0.5, 1.2 + n(0.15)), 2);
    case "hdl": return round(Math.max(0.7, (female ? 1.5 : 1.2) + hdlRng.normal(0, female ? 0.12 : 0.1) * noisy), 2);
  }
}

export function generateSeed(anchor: Date): SeedData {
  // `anchor` is midnight UTC of "today"; no seeded timestamp is at or after it.
  const anchorMs = anchor.getTime();
  const data: SeedData = {
    clinicians: [{ id: CLINICIAN_ID, name: "Dr. Sam Rivera" }],
    patients: [],
    observations: [],
    meals: [],
    symptomLogs: [],
    labReports: [],
  };

  for (const p of allProfiles()) {
    const rng = subRng(SEED, p.num);
    const hdlRng = subRng(SEED, 400 + p.num); // own stream, so adding HDL never shifts the existing draws
    const id = p.num <= 4 ? Object.values(STORY_IDS)[p.num - 1] : seedId(ID_KIND.patient, p.num);
    const dobMs = Date.UTC(
      anchor.getUTCFullYear() - p.age - 1, (p.num * 5) % 12, 1 + ((p.num * 7) % 28),
    );
    data.patients.push({
      id,
      name: p.name,
      dob: dateOnly(dobMs),
      sex: p.sex,
      clinicianId: CLINICIAN_ID,
      intake: { story: p.story, height_cm: p.heightCm, medications: p.medications },
      synthetic: true,
      createdAt: new Date(anchorMs - (VITALS_DAYS + 30) * DAY),
    });

    const obs = (ts: number, metric: Metric, value: number) =>
      data.observations.push({
        patientId: id, ts: new Date(ts), metric, value, unit: UNITS[metric],
        source: "synthetic", confidence: 1,
      });

    // Labs: yearly unless the profile says otherwise, latest about three weeks ago.
    for (let i = 0; i < p.labCount; i++) {
      const ts = anchorMs - (20 + (p.labCount - 1 - i) * (p.labIntervalDays ?? 365) + rng.int(-10, 10)) * DAY + 8 * HOUR;
      const age = ageAt(dobMs, ts);
      const values = {} as Record<LabMetric, number>;
      for (const m of LAB_METRICS) values[m] = labValue(p, m, i, rng, age, hdlRng);
      values.egfr = round(ckdEpi2021(values.creatinine, age, p.sex), 0);
      const drawn = LAB_METRICS.filter((m) => !p.skipLabs?.includes(m));
      for (const m of drawn) obs(ts, m, values[m]);
      data.labReports.push({
        id: seedId(ID_KIND.labReport, p.num * 1000 + i),
        patientId: id,
        collectedAt: new Date(ts),
        extracted: Object.fromEntries(drawn.map((m) => [m, { value: values[m], unit: UNITS[m] }])),
      });
    }

    // Waist: quarterly tape measure over two years.
    for (let q = 0; q < 8; q++) {
      const monthsBack = (7 - q) * 3;
      const ts = anchorMs - (5 + monthsBack * 30) * DAY + 9 * HOUR;
      if (anchorMs - ts < (p.silentDays ?? 0) * DAY) continue;
      obs(ts, "waist_cm", round(p.waist.latest - p.waist.perYear * (monthsBack / 12) + rng.normal(0, 0.4), 1));
    }

    // Neck circumference, asked once at intake (just before the 90 day window).
    obs(anchorMs - (VITALS_DAYS + 28) * DAY + 10 * HOUR, "neck_cm", p.neckCm);

    // Weekly sleep check-in: three yes/no taps (RISK_ENGINE §4b), thirteen weeks ending last week.
    for (let w = SLEEP_CHECKIN_WEEKS - 1; w >= 0; w--) {
      const ts = anchorMs - (2 + 7 * w) * DAY + 20 * HOUR;
      if (anchorMs - ts < (p.silentDays ?? 0) * DAY) continue;
      obs(ts, "sleep_snoring", p.sleepCheckin.snoring);
      obs(ts, "sleep_tired", p.sleepCheckin.tired);
      obs(ts, "sleep_observed_apnea", p.sleepCheckin.observedApnea);
    }

    // 90 days of daily vitals ending yesterday. Missing days are skipped entirely.
    for (let d = VITALS_DAYS; d >= 1; d--) {
      if (rng.chance(p.missingRate)) continue;
      if (d < (p.silentDays ?? 0)) continue;
      const t = VITALS_DAYS - d;
      const day = anchorMs - d * DAY;
      const v = p.vitals;
      const before = p.bpStep !== undefined && d > p.bpStep.daysAgo;
      const sysBase = before ? p.bpStep!.sysBefore : v.sys;
      const diaBase = before ? p.bpStep!.diaBefore : v.dia;
      obs(day + 7.5 * HOUR, "bp_systolic", round(sysBase + (v.sysPerDay ?? 0) * t + rng.normal(0, 5), 0));
      obs(day + 7.5 * HOUR, "bp_diastolic", round(diaBase + rng.normal(0, 3), 0));
      obs(day + 7 * HOUR, "weight_kg", round(v.weight + (v.weightPerDay ?? 0) * t + rng.normal(0, 0.3), 1));
      obs(day + 7 * HOUR, "resting_hr", round(v.hr + rng.normal(0, 2.5), 0));
      obs(day + 21 * HOUR, "steps", Math.max(500, round(v.steps + rng.normal(0, 1500), 0)));
      obs(day + 6.5 * HOUR, "sleep_hours", Math.min(9.5, Math.max(4, round(v.sleep + rng.normal(0, 0.6), 1))));
    }

    for (const [k, s] of (p.symptoms ?? []).entries()) {
      data.symptomLogs.push({
        id: seedId(ID_KIND.symptom, p.num * 1000 + k),
        patientId: id,
        ts: new Date(anchorMs - s.daysAgo * DAY + 19 * HOUR),
        text: s.text,
        codes: s.codes,
        redFlag: s.redFlag ?? false,
      });
    }

    if (p.meals) {
      MEAL_DAYS_AGO.forEach((daysAgo, k) => {
        const m = MEALS[(k + p.num) % MEALS.length];
        data.meals.push({
          id: seedId(ID_KIND.meal, p.num * 1000 + k),
          patientId: id,
          ts: new Date(anchorMs - daysAgo * DAY + 12.5 * HOUR),
          items: [{ name: m.name }],
          kcal: m.kcal, carbsG: m.carbs, proteinG: m.protein, fatG: m.fat,
          fibreG: m.fibre, sodiumMg: m.sodium, confidence: 0.6,
        });
      });
    }
  }
  return data;
}
