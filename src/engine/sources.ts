// Citation registry and verified thresholds (T-020, checked 2026-10-17).
// Every `sourceIds` entry in a Contribution or Flag is a key of SOURCES. Gemini may only cite these.
// `verification`: "primary" = read in the source document itself; "secondary" = confirmed only through
// a summary, slide deck or citing paper (re-check before a clinical claim); "convention" = textbook
// default, not a finding of the cited source.

export type Verification = "primary" | "secondary" | "convention";

export type Source = {
  title: string;
  publisher: string;
  year: number;
  url: string;
  verification: Verification;
  notes?: string;
};

export const SOURCES = {
  diabetes_canada_2018: {
    title: "Diabetes Canada 2018 Clinical Practice Guidelines: Definition, Classification and Diagnosis; Screening for Diabetes in Adults",
    publisher: "Diabetes Canada",
    year: 2018,
    url: "https://doi.org/10.1016/j.jcjd.2017.10.003",
    verification: "secondary",
    notes: "Ranges read from the guideline's screening algorithm as reproduced in the Canadian Pharmacists Association CPG slide deck. The algorithm has an 'at risk' tier below prediabetes (FPG 5.6 to 6.0, A1C 5.5 to 5.9%). When FPG and A1C disagree the guideline uses the test furthest right on the algorithm.",
  },
  canrisk: {
    title: "CANRISK: Canadian Diabetes Risk Questionnaire (PHAC)",
    publisher: "Public Health Agency of Canada",
    year: 2018,
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5833636",
    verification: "primary",
    notes: "Three bands only: low < 21, moderate 21 to 32, high >= 33. A 'very high >= 43' band was in the first draft of RISK_ENGINE.md and could not be found in any PHAC source, so it was removed. Validation papers use 21 as the cut-off under age 40.",
  },
  kdigo_2024: {
    title: "KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease",
    publisher: "KDIGO",
    year: 2024,
    url: "https://kdigo.org/wp-content/uploads/2024/03/KDIGO-2024-CKD-Guideline.pdf",
    verification: "primary",
    notes: "Read in the guideline: G3a eGFR 45 to 59, CKD = GFR < 60 for > 3 months, A2 = ACR 3 to 30 mg/mmol (30 to 300 mg/g). Practice point 2.1.3: an eGFR change > 20% on a later test exceeds expected variability.",
  },
  kdigo_2012: {
    title: "KDIGO 2012 Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease",
    publisher: "KDIGO",
    year: 2013,
    url: "https://kdigo.org/guidelines/ckd-evaluation-and-management/",
    verification: "secondary",
    notes: "Source of 'rapid progression = sustained eGFR decline > 5 mL/min/1.73m2/yr'. The 2024 update does NOT contain this sentence (searched the full text), so cite 2012 for it. Confirmed through citing papers only; the guideline does not say how long 'sustained' is.",
  },
  htn_canada_2020: {
    title: "Hypertension Canada's 2020 Comprehensive Guidelines for the Prevention, Diagnosis, Risk Assessment, and Treatment of Hypertension in Adults and Children",
    publisher: "Hypertension Canada",
    year: 2020,
    url: "https://onlinecjc.ca/article/S0828-282X(20)30191-4/fulltext",
    verification: "secondary",
    notes: "Home BP >= 135/85 mmHg is high. Home protocol: 2 morning and 2 evening readings for 7 days. Superseded for primary care by htn_canada_2025.",
  },
  htn_canada_2025: {
    title: "Hypertension Canada guideline for the diagnosis and treatment of hypertension in adults in primary care",
    publisher: "Hypertension Canada",
    year: 2025,
    url: "https://doi.org/10.1503/cmaj.241770",
    verification: "primary",
    notes: "Single threshold >= 130/80 mmHg for office, daytime ambulatory and home BP; treatment target systolic < 130. Read in Appendix 2 (responses to frequent questions). The engine still uses 135/85 for home BP, see DECISIONS.md.",
  },
  aasld_2023: {
    title: "AASLD Practice Guidance on the clinical assessment and management of nonalcoholic fatty liver disease",
    publisher: "AASLD",
    year: 2023,
    url: "https://doi.org/10.1097/HEP.0000000000000323",
    verification: "secondary",
    notes: "FIB-4 < 1.3 low risk, 1.3 to 2.67 indeterminate, > 2.67 high; lower cutoff 2.0 for age >= 65. Confirmed through society summaries and clinic algorithms, not the guidance text. FIB-4 is less reliable under 35.",
  },
  fib4_sterling_2006: {
    title: "Development of a simple noninvasive index to predict significant fibrosis in patients with HIV/HCV coinfection (FIB-4)",
    publisher: "Hepatology",
    year: 2006,
    url: "https://doi.org/10.1002/hep.21178",
    verification: "secondary",
    notes: "Original FIB-4 = age x AST / (platelets x sqrt(ALT)), AST and ALT in U/L, platelets in 10^9/L.",
  },
  fli_bedogni_2006: {
    title: "The Fatty Liver Index: a simple and accurate predictor of hepatic steatosis in the general population",
    publisher: "BMC Gastroenterology",
    year: 2006,
    url: "https://doi.org/10.1186/1471-230X-6-33",
    verification: "primary",
    notes: "L = 0.953 ln(TG mg/dL) + 0.139 BMI + 0.718 ln(GGT U/L) + 0.053 waist cm - 15.745; FLI = 100 e^L / (1 + e^L). FLI < 30 rules out (LR- 0.2), >= 60 rules in (LR+ 4.3). Derived in one Italian cohort; the authors call for external validation.",
  },
  alberti_2009: {
    title: "Harmonizing the Metabolic Syndrome: a Joint Interim Statement",
    publisher: "Circulation",
    year: 2009,
    url: "https://doi.org/10.1161/CIRCULATIONAHA.109.192644",
    verification: "secondary",
    notes: "3 of 5 criteria, no mandatory one. TG >= 1.7 mmol/L, HDL < 1.0 (men) / < 1.3 (women), BP >= 130 systolic or >= 85 diastolic, fasting glucose >= 5.6, each also met on drug treatment. Waist uses national cut points; the paper itself was paywalled, so its Canada row was not read (see health_canada_waist_2003).",
  },
  health_canada_waist_2003: {
    title: "Canadian Guidelines for Body Weight Classification in Adults",
    publisher: "Health Canada",
    year: 2003,
    url: "https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/healthy-weights/canadian-guidelines-body-weight-classification-adults/quick-reference-tool-professionals.html",
    verification: "primary",
    notes: "Increased health risk at waist >= 102 cm (men) and >= 88 cm (women). Measured midway between the lowest rib and the iliac crest. Adults 18+, not pregnant.",
  },
  stopbang_chung_2016: {
    title: "STOP-Bang Questionnaire: A Practical Approach to Screen for Obstructive Sleep Apnea",
    publisher: "Chest",
    year: 2016,
    url: "https://doi.org/10.1378/chest.15-0903",
    verification: "secondary",
    notes: "0 to 2 low, 3 to 4 intermediate, 5 to 8 high. Items: BMI > 35, age > 50, neck > 40 cm (all strict), male. Chung also upgrades a 3 to 4 score to high with STOP >= 2 plus BMI > 35, neck > 40 or male; the engine deliberately does not apply that upgrade (intermediate stays supporting only).",
  },
  mann_1945: {
    title: "Nonparametric Tests Against Trend",
    publisher: "Econometrica 13(3), 245-259",
    year: 1945,
    url: "https://doi.org/10.2307/1907187",
    verification: "primary",
    notes: "Reference only (bibliographic record checked). Trend gate n >= 4, p < 0.10 is our tuning, not the paper's.",
  },
  kendall_1975: {
    title: "Rank Correlation Methods (4th ed.)",
    publisher: "Charles Griffin, London",
    year: 1975,
    url: "https://search.worldcat.org/search?q=Kendall+Rank+Correlation+Methods",
    verification: "secondary",
    notes: "Book, no DOI, so the URL is a catalogue search. Reference for the S statistic and tie-corrected variance; not opened.",
  },
  sen_1968: {
    title: "Estimates of the Regression Coefficient Based on Kendall's Tau",
    publisher: "Journal of the American Statistical Association 63, 1379-1389",
    year: 1968,
    url: "https://doi.org/10.1080/01621459.1968.10480934",
    verification: "primary",
    notes: "Reference only (bibliographic record checked). Slope = median of pairwise slopes.",
  },
  page_1954: {
    title: "Continuous Inspection Schemes",
    publisher: "Biometrika 41(1-2), 100-115",
    year: 1954,
    url: "https://doi.org/10.1093/biomet/41.1-2.100",
    verification: "primary",
    notes: "Reference for the CUSUM. k = 0.5 and h = 5 SDs are the conventional textbook parameters, not values from this paper; tuned in changepoint.ts.",
  },
} as const satisfies Record<string, Source>;

export type SourceId = keyof typeof SOURCES;

export function isSourceId(id: string): id is SourceId {
  return Object.hasOwn(SOURCES, id);
}

// Verified numeric thresholds, in the units fixed by CLAUDE.md §4. Engine modules import these
// instead of hard-coding numbers. `source` is the key to cite when the threshold fires.
export const THRESHOLDS = {
  // HbA1c in %, FPG in mmol/L. "Prediabetes" starts at the From value; diabetes at diabetesFrom.
  hba1c: { atRiskFrom: 5.5, prediabetesFrom: 6.0, diabetesFrom: 6.5, source: "diabetes_canada_2018" },
  fpg: { atRiskFrom: 5.6, prediabetesFrom: 6.1, diabetesFrom: 7.0, source: "diabetes_canada_2018" },
  // CANRISK score points. No "very high" band exists.
  canrisk: { moderateFrom: 21, highFrom: 33, source: "canrisk" },
  ckd: {
    egfrCkdBelow: 60, // mL/min/1.73m², CKD when below this for more than 3 months (G3a is 45 to 59)
    chronicityMonths: 3,
    acrA2From: 3, // mg/mmol
    acrA3From: 30, // mg/mmol
    rapidDeclinePerYear: 5, // mL/min/1.73m²/yr, strictly greater
    source: "kdigo_2024",
    rapidDeclineSource: "kdigo_2012",
  },
  // Home BP average over >= 7 days, mmHg. Engine default is the 2020 value, see DECISIONS.md.
  homeBp: { systolic: 135, diastolic: 85, source: "htn_canada_2020", minDays: 7 },
  homeBpPrimaryCare2025: { systolic: 130, diastolic: 80, source: "htn_canada_2025" },
  fib4: { low: 1.3, lowAge65Plus: 2.0, high: 2.67, age65Plus: 65, source: "aasld_2023" },
  fli: { ruleOutBelow: 30, ruleInFrom: 60, triglyceridesMmolToMgDl: 88.57, source: "fli_bedogni_2006" },
  mets: {
    minCriteria: 3,
    waistCm: { male: 102, female: 88, source: "health_canada_waist_2003" },
    triglyceridesMmolL: 1.7,
    hdlMmolL: { male: 1.0, female: 1.3 }, // met when strictly below
    bpSystolic: 130,
    bpDiastolic: 85,
    fpgMmolL: 5.6,
    source: "alberti_2009",
  },
  stopbang: {
    intermediateFrom: 3,
    highFrom: 5,
    bmiAbove: 35,
    ageAbove: 50,
    neckCmAbove: 40,
    source: "stopbang_chung_2016",
  },
} as const;
