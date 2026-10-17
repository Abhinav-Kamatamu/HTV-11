// Every seed row gets a uuid starting with SEED_ID_PREFIX, so the reseed can find and replace
// exactly its own rows and leave anything created by real use (uploads, validated flags) alone.
export const SEED_ID_PREFIX = "5eed";

export const ID_KIND = { clinician: 1, patient: 2, meal: 3, symptom: 4, labReport: 5 } as const;

export function seedId(kind: number, n: number): string {
  return `${SEED_ID_PREFIX}${kind.toString(16).padStart(4, "0")}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

export const CLINICIAN_ID = seedId(ID_KIND.clinician, 1);

// Patient numbers: A=1, B=2, C=3, urgent=4, controls 5 and up. Fixed so routes and the demo can link to them.
export const STORY_IDS = {
  A: seedId(ID_KIND.patient, 1),
  B: seedId(ID_KIND.patient, 2),
  C: seedId(ID_KIND.patient, 3),
  URGENT: seedId(ID_KIND.patient, 4),
} as const;

// The patient who logged daily and then went silent (T-011); the first number after the controls.
export const SILENT_ID = seedId(ID_KIND.patient, 25);
